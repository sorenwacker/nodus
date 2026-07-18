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
/// metadata services like 169.254.169.254) are blocked. Localhost stays
/// reachable because local LLM providers (Ollama, LM Studio) and the Zotero
/// API run there.
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
        let blocked = match ip {
            std::net::IpAddr::V4(v4) => {
                v4.is_link_local() || v4.is_unspecified() || v4.is_broadcast()
            }
            std::net::IpAddr::V6(v6) => {
                v6.is_unspecified() || (v6.segments()[0] & 0xffc0) == 0xfe80
            }
        };
        if blocked {
            return Err("Access to link-local addresses is not allowed".to_string());
        }
    } else if bare_host.eq_ignore_ascii_case("metadata.google.internal") {
        return Err("Access to cloud metadata services is not allowed".to_string());
    }
    Ok(())
}

/// Make an HTTP request from Rust (bypasses CORS)
#[tauri::command]
pub async fn http_request(input: HttpRequestInput) -> Result<HttpResponse, String> {
    validate_outbound_url(&input.url)?;
    let client = reqwest::Client::new();

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

    let response = request.send().await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(HttpResponse { status, body })
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
}
