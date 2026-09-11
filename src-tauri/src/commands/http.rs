//! HTTP commands for LLM API calls

use serde::Deserialize;

// ============================================================================
// HTTP Commands (for LLM API calls)
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct HttpRequestInput {
    pub url: String,
    pub method: String,
    pub headers: std::collections::HashMap<String, String>,
    pub body: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, serde::Serialize)]
pub struct HttpResponse {
    pub status: u16,
    pub body: String,
}

/// Validate a URL before making an outbound request on behalf of the webview.
/// Only http/https are allowed, and link-local addresses (notably cloud
/// metadata services like 169.254.169.254) are blocked however they are
/// written. Localhost stays reachable because local LLM providers (Ollama,
/// LM Studio) and the Zotero API run there. A host given by name is checked
/// by `GuardedResolver` when the client connects, and every redirect is
/// checked again (PRODUCT_DESIGN.md > Checking outbound URLs).
pub(crate) fn validate_outbound_url(url: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("Invalid URL: {}", e))?;
    match parsed.scheme() {
        "http" | "https" => {}
        scheme => return Err(format!("Unsupported URL scheme: {}", scheme)),
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "URL must have a host".to_string())?;
    let bare_host = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = bare_host.parse::<std::net::IpAddr>() {
        if is_blocked_ip(ip) {
            return Err("Access to link-local addresses is not allowed".to_string());
        }
    } else if bare_host.eq_ignore_ascii_case("metadata.google.internal") {
        return Err("Access to cloud metadata services is not allowed".to_string());
    }
    Ok(())
}

/// Whether an outbound request may not connect to `ip`: link-local (cloud
/// metadata services live there), unspecified or broadcast. An IPv4 address
/// carried inside IPv6 is the same address and gets the same answer.
fn is_blocked_ip(ip: std::net::IpAddr) -> bool {
    let blocked_v4 =
        |v4: std::net::Ipv4Addr| v4.is_link_local() || v4.is_unspecified() || v4.is_broadcast();
    match ip {
        std::net::IpAddr::V4(v4) => blocked_v4(v4),
        std::net::IpAddr::V6(v6) => {
            v6.is_unspecified()
                || (v6.segments()[0] & 0xffc0) == 0xfe80
                || v6.to_ipv4().is_some_and(blocked_v4)
        }
    }
}

/// The addresses a lookup returned that a request may connect to. A name that
/// resolves only to blocked addresses is refused.
fn allowed_addrs(
    addrs: impl IntoIterator<Item = std::net::SocketAddr>,
) -> Result<Vec<std::net::SocketAddr>, String> {
    let allowed: Vec<_> = addrs
        .into_iter()
        .filter(|a| !is_blocked_ip(a.ip()))
        .collect();
    if allowed.is_empty() {
        return Err("Access to link-local addresses is not allowed".to_string());
    }
    Ok(allowed)
}

/// Resolves a host when the client connects and drops blocked addresses, so a
/// name is judged by the address the request actually reaches.
struct GuardedResolver;

impl reqwest::dns::Resolve for GuardedResolver {
    fn resolve(&self, name: reqwest::dns::Name) -> reqwest::dns::Resolving {
        let host = name.as_str().to_string();
        Box::pin(async move {
            // Port 0: the client substitutes the URL's port
            let addrs = tokio::net::lookup_host((host.as_str(), 0)).await?;
            let allowed = allowed_addrs(addrs)?;
            let addrs: reqwest::dns::Addrs = Box::new(allowed.into_iter());
            Ok(addrs)
        })
    }
}

/// Follows a redirect only to a URL that would pass the first check.
fn guarded_redirects() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= 10 {
            return attempt.error("too many redirects");
        }
        match validate_outbound_url(attempt.url().as_str()) {
            Ok(()) => attempt.follow(),
            Err(e) => attempt.error(e),
        }
    })
}

/// A client for requests to URLs the webview supplies.
pub(crate) fn guarded_client_builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .dns_resolver(std::sync::Arc::new(GuardedResolver))
        .redirect(guarded_redirects())
}

/// Describe a failed request in terms the user can act on.
///
/// `reqwest::Error`'s own message is a wrapper - "error sending request for
/// url (...)" - and the cause that says whether the request timed out, failed
/// DNS, or was refused lives in its source chain. Reporting only the wrapper
/// tells the user their endpoint is broken without saying how, which is what
/// "cannot be reached" looked like for a host that was answering fine.
fn describe_request_error(err: &reqwest::Error, timeout: std::time::Duration) -> String {
    let kind = if err.is_timeout() {
        format!("timed out after {}s", timeout.as_secs())
    } else if err.is_connect() {
        "could not connect".to_string()
    } else if err.is_redirect() {
        "too many redirects".to_string()
    } else if err.is_body() || err.is_decode() {
        "malformed response".to_string()
    } else {
        "request failed".to_string()
    };

    let mut causes = Vec::new();
    let mut source = std::error::Error::source(err);
    while let Some(cause) = source {
        let text = cause.to_string();
        if !causes.contains(&text) {
            causes.push(text);
        }
        source = cause.source();
    }

    if causes.is_empty() {
        kind
    } else {
        format!("{}: {}", kind, causes.join(": "))
    }
}

/// Make an HTTP request from Rust (bypasses CORS)
#[tauri::command]
pub async fn http_request(input: HttpRequestInput) -> Result<HttpResponse, String> {
    validate_outbound_url(&input.url)?;
    let client = guarded_client_builder()
        .build()
        .map_err(|e| e.to_string())?;

    let timeout = std::time::Duration::from_millis(input.timeout_ms.unwrap_or(60000));

    let mut request = match input.method.to_uppercase().as_str() {
        "GET" => client.get(&input.url),
        "POST" => client.post(&input.url),
        "PUT" => client.put(&input.url),
        "DELETE" => client.delete(&input.url),
        "PATCH" => client.patch(&input.url),
        _ => return Err(format!("Unsupported HTTP method: {}", input.method)),
    };

    request = request.timeout(timeout);

    for (key, value) in input.headers {
        request = request.header(&key, &value);
    }

    if let Some(body) = input.body {
        request = request.body(body);
    }

    let response = request
        .send()
        .await
        .map_err(|e| describe_request_error(&e, timeout))?;
    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(HttpResponse { status, body })
}

/// Make a streaming HTTP request, forwarding each chunk as it arrives.
///
/// A buffered response is indistinguishable from a stalled connection while the
/// model is still generating, and gateways cut it. Forwarding chunks keeps the
/// connection demonstrably alive and lets the interface show progress
/// (PRODUCT_DESIGN.md > Streaming responses).
#[tauri::command]
pub async fn http_stream_request(
    input: HttpRequestInput,
    on_chunk: tauri::ipc::Channel<String>,
) -> Result<u16, String> {
    use futures_util::StreamExt;

    validate_outbound_url(&input.url)?;
    let client = guarded_client_builder()
        .build()
        .map_err(|e| e.to_string())?;
    let timeout = std::time::Duration::from_millis(input.timeout_ms.unwrap_or(60000));

    let mut request = match input.method.to_uppercase().as_str() {
        "POST" => client.post(&input.url),
        "GET" => client.get(&input.url),
        method => return Err(format!("Unsupported method for streaming: {}", method)),
    };
    request = request.timeout(timeout);
    for (key, value) in input.headers {
        request = request.header(&key, &value);
    }
    if let Some(body) = input.body {
        request = request.body(body);
    }

    let response = request
        .send()
        .await
        .map_err(|e| describe_request_error(&e, timeout))?;
    let status = response.status().as_u16();

    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| describe_request_error(&e, timeout))?;
        // Lossy on purpose: a multi-byte character split across chunks must not
        // abort a response that is otherwise fine
        on_chunk
            .send(String::from_utf8_lossy(&bytes).into_owned())
            .map_err(|e| format!("Failed to forward chunk: {}", e))?;
    }

    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::validate_outbound_url;

    #[test]
    fn allows_https_and_localhost() {
        assert!(validate_outbound_url("https://api.anthropic.com/v1/messages").is_ok());
        assert!(validate_outbound_url("http://localhost:11434/api/chat").is_ok());
        assert!(validate_outbound_url("http://127.0.0.1:23119/api/users/0/items").is_ok());
    }

    #[test]
    fn blocks_non_http_schemes() {
        assert!(validate_outbound_url("file:///etc/passwd").is_err());
        assert!(validate_outbound_url("ftp://example.com/x").is_err());
        assert!(validate_outbound_url("gopher://example.com").is_err());
    }

    #[test]
    fn blocks_link_local_and_metadata() {
        assert!(validate_outbound_url("http://169.254.169.254/latest/meta-data/").is_err());
        assert!(validate_outbound_url("http://[fe80::1]/").is_err());
        assert!(
            validate_outbound_url("http://metadata.google.internal/computeMetadata/v1/").is_err()
        );
        assert!(validate_outbound_url("http://0.0.0.0/").is_err());
    }

    /// The metadata address written as an IPv4-mapped IPv6 literal is the same
    /// address, and must be refused as such (PRODUCT_DESIGN.md > Checking
    /// outbound URLs).
    #[test]
    fn blocks_ipv4_mapped_ipv6_literals() {
        assert!(
            validate_outbound_url("http://[::ffff:169.254.169.254]/latest/meta-data/").is_err()
        );
        assert!(validate_outbound_url("http://[::ffff:a9fe:a9fe]/").is_err());
        assert!(validate_outbound_url("http://[::ffff:0.0.0.0]/").is_err());
    }

    /// A name is checked by the addresses it resolves to when the client
    /// connects, so a lookup that answers differently the second time cannot
    /// pass a check made the first time.
    #[test]
    fn drops_link_local_addresses_a_name_resolves_to() {
        use std::net::SocketAddr;
        let metadata: SocketAddr = "169.254.169.254:80".parse().unwrap();
        let mapped: SocketAddr = "[::ffff:169.254.169.254]:80".parse().unwrap();
        let loopback: SocketAddr = "127.0.0.1:11434".parse().unwrap();

        assert!(super::allowed_addrs(vec![metadata, mapped]).is_err());
        assert_eq!(
            super::allowed_addrs(vec![metadata, loopback, mapped]).unwrap(),
            vec![loopback]
        );
    }

    /// A redirect is a request to another address, so it is checked like the
    /// first one rather than followed to wherever it points.
    #[tokio::test]
    async fn refuses_a_redirect_to_a_link_local_address() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut request = [0u8; 1024];
                let _ = stream.read(&mut request);
                let _ = stream.write_all(
                    b"HTTP/1.1 302 Found\r\nLocation: http://169.254.169.254/latest/meta-data/\r\nContent-Length: 0\r\n\r\n",
                );
            }
        });

        let result = super::http_request(super::HttpRequestInput {
            url: format!("http://{}/redirect", addr),
            method: "GET".to_string(),
            headers: std::collections::HashMap::new(),
            body: None,
            timeout_ms: Some(2000),
        })
        .await;

        let message = result.unwrap_err();
        assert!(
            message.contains("not allowed"),
            "expected the redirect to be refused, got: {message}"
        );
    }

    #[tokio::test]
    async fn a_timeout_says_so_instead_of_reporting_a_bare_send_failure() {
        // A host that accepts the connection and never answers: reqwest wraps
        // the timeout in "error sending request for url", which reads as an
        // unreachable endpoint even when the endpoint is fine
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            let _keep = listener.accept();
            std::thread::sleep(std::time::Duration::from_secs(5));
        });

        let result = super::http_request(super::HttpRequestInput {
            url: format!("http://{}/v1/chat/completions", addr),
            method: "POST".to_string(),
            headers: std::collections::HashMap::new(),
            body: Some("{}".to_string()),
            timeout_ms: Some(300),
        })
        .await;

        let message = result.unwrap_err();
        assert!(
            message.contains("timed out"),
            "expected a timeout to be named, got: {message}"
        );
    }

    #[tokio::test]
    async fn an_unresolvable_host_reports_the_dns_failure() {
        let result = super::http_request(super::HttpRequestInput {
            url: "https://nodus-no-such-host.invalid/v1/models".to_string(),
            method: "GET".to_string(),
            headers: std::collections::HashMap::new(),
            body: None,
            timeout_ms: Some(3000),
        })
        .await;

        let message = result.unwrap_err();
        assert!(
            message.contains("connect") || message.to_lowercase().contains("dns"),
            "expected the cause to be named, got: {message}"
        );
    }
}
