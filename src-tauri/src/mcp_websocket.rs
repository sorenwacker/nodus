//! MCP WebSocket Server
//!
//! Provides a WebSocket server for MCP (Model Context Protocol) clients
//! to interact with the currently open workspace in Nodus.

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio_tungstenite::tungstenite::Message;

/// Default port for MCP WebSocket server
const DEFAULT_PORT: u16 = 9742;

/// Connection state for approval workflow
#[derive(Debug, Clone, PartialEq)]
pub enum ConnectionState {
    PendingApproval,
    Approved,
    Rejected,
}

/// Represents a connected MCP client
#[derive(Debug)]
pub struct McpConnection {
    pub id: String,
    pub state: ConnectionState,
    pub sender: mpsc::UnboundedSender<Message>,
}

impl McpConnection {
    fn send_text(&self, text: String) {
        let _ = self.sender.send(Message::Text(text));
    }
}

/// Shared state for the MCP server
pub struct McpServerState {
    pub connections: RwLock<HashMap<String, McpConnection>>,
    pub running: RwLock<bool>,
    pub port: RwLock<Option<u16>>,
    shutdown_tx: Mutex<Option<mpsc::Sender<()>>>,
}

impl McpServerState {
    pub fn new() -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
            running: RwLock::new(false),
            port: RwLock::new(None),
            shutdown_tx: Mutex::new(None),
        }
    }

    pub async fn is_running(&self) -> bool {
        *self.running.read().await
    }

    pub async fn get_port(&self) -> Option<u16> {
        *self.port.read().await
    }
}

impl Default for McpServerState {
    fn default() -> Self {
        Self::new()
    }
}

/// JSON-RPC 2.0 Request
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: Option<serde_json::Value>,
    pub method: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

/// JSON-RPC 2.0 Response
#[derive(Debug, Serialize, Clone)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

/// JSON-RPC 2.0 Error
#[derive(Debug, Serialize, Clone)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl JsonRpcResponse {
    pub fn success(id: Option<serde_json::Value>, result: serde_json::Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(result),
            error: None,
        }
    }

    pub fn error(id: Option<serde_json::Value>, code: i32, message: &str) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(JsonRpcError {
                code,
                message: message.to_string(),
                data: None,
            }),
        }
    }
}

/// Standard JSON-RPC error codes
pub const PARSE_ERROR: i32 = -32700;
#[allow(dead_code)]
pub const INVALID_REQUEST: i32 = -32600;
#[allow(dead_code)]
pub const METHOD_NOT_FOUND: i32 = -32601;
#[allow(dead_code)]
pub const INVALID_PARAMS: i32 = -32602;
#[allow(dead_code)]
pub const INTERNAL_ERROR: i32 = -32603;
pub const NOT_APPROVED: i32 = -32001;

/// Event emitted when a new connection requests approval
#[derive(Debug, Serialize, Clone)]
pub struct ConnectionRequestEvent {
    pub connection_id: String,
    /// Peer address so the user can identify who is asking for access
    pub peer_addr: Option<String>,
}

/// Event emitted when a message is received from an approved client
#[derive(Debug, Serialize, Clone)]
pub struct McpMessageEvent {
    pub connection_id: String,
    pub request: JsonRpcRequest,
}

/// Event emitted when a connection is closed
#[derive(Debug, Serialize, Clone)]
pub struct ConnectionClosedEvent {
    pub connection_id: String,
}

/// Start the MCP WebSocket server
pub async fn start_server(
    state: Arc<McpServerState>,
    app_handle: tauri::AppHandle,
) -> Result<u16, String> {
    // Check if already running
    if *state.running.read().await {
        return Err("Server already running".to_string());
    }

    // Try to bind to default port, then try alternatives
    let listener = find_available_port(DEFAULT_PORT).await?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    // Create shutdown channel
    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
    *state.shutdown_tx.lock().await = Some(shutdown_tx);
    *state.running.write().await = true;
    *state.port.write().await = Some(port);

    let state_clone = Arc::clone(&state);
    let app_handle_clone = app_handle.clone();

    tokio::spawn(async move {
        loop {
            tokio::select! {
                result = listener.accept() => {
                    match result {
                        Ok((stream, addr)) => {
                            let conn_id = uuid::Uuid::new_v4().to_string();
                            println!("[MCP] New connection from {}: {}", addr, conn_id);

                            let state_conn = Arc::clone(&state_clone);
                            let app_handle_conn = app_handle_clone.clone();
                            let conn_id_clone = conn_id.clone();

                            tokio::spawn(async move {
                                if let Err(e) = handle_connection(
                                    stream,
                                    conn_id_clone,
                                    state_conn,
                                    app_handle_conn,
                                ).await {
                                    eprintln!("[MCP] Connection error: {}", e);
                                }
                            });
                        }
                        Err(e) => {
                            eprintln!("[MCP] Accept error: {}", e);
                        }
                    }
                }
                _ = shutdown_rx.recv() => {
                    println!("[MCP] Server shutdown requested");
                    break;
                }
            }
        }

        // Cleanup: close every client connection, then drop them
        {
            let mut connections = state_clone.connections.write().await;
            for conn in connections.values() {
                let _ = conn.sender.send(Message::Close(None));
            }
            connections.clear();
        }
        *state_clone.running.write().await = false;
        *state_clone.port.write().await = None;
        println!("[MCP] Server stopped");
    });

    Ok(port)
}

/// Stop the MCP WebSocket server
pub async fn stop_server(state: Arc<McpServerState>) -> Result<(), String> {
    if !*state.running.read().await {
        return Err("Server not running".to_string());
    }

    if let Some(tx) = state.shutdown_tx.lock().await.take() {
        let _ = tx.send(()).await;
    }

    Ok(())
}

/// Approve or reject a connection
pub async fn approve_connection(
    state: Arc<McpServerState>,
    connection_id: &str,
    approved: bool,
) -> Result<(), String> {
    let mut connections = state.connections.write().await;

    let conn = connections
        .get_mut(connection_id)
        .ok_or("Connection not found")?;

    if conn.state != ConnectionState::PendingApproval {
        return Err("Connection already processed".to_string());
    }

    if approved {
        conn.state = ConnectionState::Approved;
        // Send approval confirmation
        let response = JsonRpcResponse::success(
            None,
            serde_json::json!({"status": "approved", "message": "Connection approved by user"}),
        );
        conn.send_text(serde_json::to_string(&response).unwrap());
        println!("[MCP] Connection {} approved", connection_id);
    } else {
        conn.state = ConnectionState::Rejected;
        // Send rejection, then actually close the socket
        let response = JsonRpcResponse::error(None, NOT_APPROVED, "Connection rejected by user");
        conn.send_text(serde_json::to_string(&response).unwrap());
        let _ = conn.sender.send(Message::Close(None));
        println!("[MCP] Connection {} rejected", connection_id);
    }

    Ok(())
}

/// Send a response to a specific connection
pub async fn send_response(
    state: Arc<McpServerState>,
    connection_id: &str,
    response: &str,
) -> Result<(), String> {
    let connections = state.connections.read().await;

    let conn = connections
        .get(connection_id)
        .ok_or("Connection not found")?;

    if conn.state != ConnectionState::Approved {
        return Err("Connection not approved".to_string());
    }

    conn.sender
        .send(Message::Text(response.to_string()))
        .map_err(|e| e.to_string())
}

/// Get list of pending connections
pub async fn get_pending_connections(state: Arc<McpServerState>) -> Vec<String> {
    state
        .connections
        .read()
        .await
        .iter()
        .filter(|(_, c)| c.state == ConnectionState::PendingApproval)
        .map(|(id, _)| id.clone())
        .collect()
}

/// Find an available port starting from the default
async fn find_available_port(start_port: u16) -> Result<TcpListener, String> {
    for port in start_port..start_port + 100 {
        if let Ok(listener) = TcpListener::bind(format!("127.0.0.1:{}", port)).await {
            return Ok(listener);
        }
    }
    Err("No available port found".to_string())
}

/// Handle a single WebSocket connection
async fn handle_connection(
    stream: TcpStream,
    connection_id: String,
    state: Arc<McpServerState>,
    app_handle: tauri::AppHandle,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let peer_addr = stream.peer_addr().ok();

    // Reject handshakes carrying an Origin header: those come from browsers,
    // and a malicious web page must not be able to reach the local MCP server.
    // Native MCP clients do not send Origin.
    let ws_stream = tokio_tungstenite::accept_hdr_async(
        stream,
        |request: &tokio_tungstenite::tungstenite::handshake::server::Request,
         response: tokio_tungstenite::tungstenite::handshake::server::Response| {
            if request.headers().contains_key("origin") {
                let mut forbidden =
                    tokio_tungstenite::tungstenite::handshake::server::ErrorResponse::new(Some(
                        "Browser connections are not allowed".to_string(),
                    ));
                *forbidden.status_mut() =
                    tokio_tungstenite::tungstenite::http::StatusCode::FORBIDDEN;
                return Err(forbidden);
            }
            Ok(response)
        },
    )
    .await?;
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    // Create channel for sending messages to this connection
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    // All connections require approval (user preference)
    let initial_state = ConnectionState::PendingApproval;
    println!("[MCP] New connection {} requires approval", connection_id);

    // Register connection
    {
        let mut connections = state.connections.write().await;
        connections.insert(
            connection_id.clone(),
            McpConnection {
                id: connection_id.clone(),
                state: initial_state.clone(),
                sender: tx,
            },
        );
    }

    // Emit connection request for user approval
    use tauri::Emitter;
    let _ = app_handle.emit(
        "mcp-connection-request",
        ConnectionRequestEvent {
            connection_id: connection_id.clone(),
            peer_addr: peer_addr.map(|a| a.to_string()),
        },
    );

    // Spawn task to forward outgoing messages
    let conn_id_out = connection_id.clone();
    let outgoing = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let closing = matches!(msg, Message::Close(_));
            if ws_sender.send(msg).await.is_err() || closing {
                break;
            }
        }
        println!("[MCP] Outgoing handler closed for {}", conn_id_out);
    });

    // Handle incoming messages
    while let Some(msg) = ws_receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                let text_str: String = text;
                // Parse JSON-RPC request
                match serde_json::from_str::<JsonRpcRequest>(&text_str) {
                    Ok(request) => {
                        // Check connection state
                        let is_approved = {
                            let connections = state.connections.read().await;
                            connections
                                .get(&connection_id)
                                .map(|c| c.state == ConnectionState::Approved)
                                .unwrap_or(false)
                        };

                        if !is_approved {
                            // Only allow status check before approval
                            let response = if request.method == "get_status" {
                                JsonRpcResponse::success(
                                    request.id.clone(),
                                    serde_json::json!({"status": "pending_approval"}),
                                )
                            } else {
                                JsonRpcResponse::error(
                                    request.id.clone(),
                                    NOT_APPROVED,
                                    "Connection pending approval",
                                )
                            };
                            if let Some(c) = state.connections.read().await.get(&connection_id) {
                                c.send_text(serde_json::to_string(&response).unwrap());
                            }
                            continue;
                        }

                        // Forward to frontend for handling
                        let _ = app_handle.emit(
                            "mcp-message",
                            McpMessageEvent {
                                connection_id: connection_id.clone(),
                                request,
                            },
                        );
                    }
                    Err(e) => {
                        // Send parse error
                        let response = JsonRpcResponse::error(
                            None,
                            PARSE_ERROR,
                            &format!("Parse error: {}", e),
                        );
                        if let Some(c) = state.connections.read().await.get(&connection_id) {
                            c.send_text(serde_json::to_string(&response).unwrap());
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => {
                println!("[MCP] Connection {} closed by client", connection_id);
                break;
            }
            Ok(Message::Ping(data)) => {
                // Respond with a Pong control frame; a text frame here would
                // corrupt the JSON-RPC stream
                if let Some(c) = state.connections.read().await.get(&connection_id) {
                    let _ = c.sender.send(Message::Pong(data));
                }
            }
            Err(e) => {
                eprintln!("[MCP] WebSocket error for {}: {}", connection_id, e);
                break;
            }
            _ => {}
        }
    }

    // Cleanup
    outgoing.abort();
    state.connections.write().await.remove(&connection_id);

    // Emit disconnection event
    let _ = app_handle.emit(
        "mcp-connection-closed",
        ConnectionClosedEvent {
            connection_id: connection_id.clone(),
        },
    );

    println!("[MCP] Connection {} cleaned up", connection_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_json_rpc_response_success() {
        let response =
            JsonRpcResponse::success(Some(serde_json::json!(1)), serde_json::json!({"ok": true}));
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"result\""));
        assert!(!json.contains("\"error\""));
    }

    #[test]
    fn test_json_rpc_response_error() {
        let response =
            JsonRpcResponse::error(Some(serde_json::json!(1)), -32600, "Invalid request");
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"error\""));
        assert!(!json.contains("\"result\""));
    }
}
