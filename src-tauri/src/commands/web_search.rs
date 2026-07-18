//! Web search commands for searching and fetching web content

// ============================================================================
// Web Search Commands
// ============================================================================

#[derive(Debug, serde::Serialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub content: String,
}

/// Search the web using Tavily API
/// Requires a Tavily API key (free tier: 1000 credits/month, no credit card)
/// Get your key at: https://tavily.com/
#[tauri::command]
pub async fn web_search(
    query: String,
    api_key: Option<String>,
) -> Result<Vec<SearchResult>, String> {
    let api_key = api_key.filter(|k| !k.is_empty())
        .ok_or_else(|| "No search API key configured. Get a free Tavily API key at https://tavily.com/ and add it in Settings.".to_string())?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let body = serde_json::json!({
        "api_key": api_key,
        "query": query,
        "max_results": 5,
        "include_answer": false
    });

    let response = client
        .post("https://api.tavily.com/search")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Search request failed: {}", e))?;

    if response.status() == 401 || response.status() == 403 {
        return Err("Invalid Tavily API key. Check your key in Settings.".to_string());
    }

    if response.status() == 429 {
        return Err("Tavily rate limit exceeded. Try again later.".to_string());
    }

    if !response.status().is_success() {
        return Err(format!("Search returned status: {}", response.status()));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse search results: {}", e))?;

    let mut results: Vec<SearchResult> = Vec::new();

    if let Some(search_results) = json.get("results").and_then(|r| r.as_array()) {
        for item in search_results.iter().take(5) {
            let title = item
                .get("title")
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string();
            let url = item
                .get("url")
                .and_then(|u| u.as_str())
                .unwrap_or("")
                .to_string();
            let content = item
                .get("content")
                .and_then(|c| c.as_str())
                .unwrap_or("")
                .to_string();

            if !title.is_empty() && !url.is_empty() {
                results.push(SearchResult {
                    title,
                    url,
                    content,
                });
            }
        }
    }

    if results.is_empty() {
        return Err("No search results found".to_string());
    }

    Ok(results)
}

/// Fetch and extract content from a URL.
///
/// By default the URL is fetched directly so it is never shared with a third
/// party. Passing `use_reader = true` opts in to the Jina Reader proxy
/// (r.jina.ai), which renders JavaScript and returns clean markdown but sees
/// every fetched URL.
#[tauri::command]
pub async fn fetch_url(url: String, use_reader: Option<bool>) -> Result<String, String> {
    super::http::validate_outbound_url(&url)?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    if use_reader != Some(true) {
        return fetch_url_direct(&client, &url).await;
    }

    let jina_url = format!("https://r.jina.ai/{}", url);
    let response = client
        .get(&jina_url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )
        .header("Accept", "text/plain")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;

    if !response.status().is_success() {
        // Fallback to direct fetch if Jina fails
        return fetch_url_direct(&client, &url).await;
    }

    let content = response
        .text()
        .await
        .map_err(|e| format!("Failed to read content: {}", e))?;

    Ok(content)
}

/// Direct fetch fallback (for when Jina is unavailable)
async fn fetch_url_direct(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let response = client
        .get(url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )
        .send()
        .await
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("URL returned status: {}", response.status()));
    }

    let html = response
        .text()
        .await
        .map_err(|e| format!("Failed to read content: {}", e))?;

    // Basic HTML to text conversion
    // Remove script and style tags first
    let script_re = regex::Regex::new(r"(?is)<script[^>]*>.*?</script>").unwrap();
    let style_re = regex::Regex::new(r"(?is)<style[^>]*>.*?</style>").unwrap();
    let tag_re = regex::Regex::new(r"<[^>]+>").unwrap();
    let whitespace_re = regex::Regex::new(r"\s+").unwrap();

    let text = script_re.replace_all(&html, "");
    let text = style_re.replace_all(&text, "");
    let text = tag_re.replace_all(&text, " ");
    let text = html_escape::decode_html_entities(&text);
    let text = whitespace_re.replace_all(&text, " ");
    let text = text.trim().to_string();

    Ok(text)
}
