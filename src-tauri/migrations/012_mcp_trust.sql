-- Trusted MCP clients: token hashes issued on user approval so known
-- clients reconnect without re-prompting
CREATE TABLE IF NOT EXISTS mcp_trusted_clients (
    token_hash TEXT PRIMARY KEY,
    label TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL
);
