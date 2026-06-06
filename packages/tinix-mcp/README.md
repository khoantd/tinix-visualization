# TiniX MCP Server

Model Context Protocol server exposing curated tools for the TiniX Agent API.

## Setup

1. Create an agent app in **Data Management → AI Agents**.
2. Copy the API key to your environment (server-side only).

```bash
export TINIX_BASE_URL=http://127.0.0.1:4000
export TINIX_AGENT_API_KEY=tag_your_key_here
```

3. Build and run:

```bash
cd packages/tinix-mcp
npm install
npm run build
npm start
```

## Cursor configuration

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "tinix": {
      "command": "node",
      "args": ["packages/tinix-mcp/dist/index.js"],
      "env": {
        "TINIX_BASE_URL": "http://127.0.0.1:4000",
        "TINIX_AGENT_API_KEY": "tag_your_key_here"
      }
    }
  }
}
```

## Tools

| Tool | Scope |
|------|-------|
| `tinix_list_dashboards` | catalog:read |
| `tinix_get_dashboard` | catalog:read |
| `tinix_list_datasets` | catalog:read |
| `tinix_get_dataset_schema` | catalog:read |
| `tinix_run_query` | data:read |
| `tinix_analyze_dataset` | auto_bi |
| `tinix_suggest_charts` | auto_bi |
| `tinix_generate_dashboard` | dashboard:write |
| `tinix_create_dashboard` | dashboard:write |
| `tinix_update_dashboard` | dashboard:write |
| `tinix_publish_dashboard` | dashboard:publish |
| `tinix_mint_embed_token` | embed:mint |
