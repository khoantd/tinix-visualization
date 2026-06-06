# AI Agent Integration

TiniX exposes a scoped **Agent API** and **MCP server** so external AI agents (Cursor, Claude Desktop, custom backends) can discover data, run Auto-BI, and build dashboards programmatically.

## Quick start

1. Run the stack: `npm run dev:all`
2. Open **Data Management → AI Agent Integration**
3. Create an agent app with required scopes (builder agents need `auto_bi` + `dashboard:write`)
4. Copy the `tag_…` API key **once** — store server-side only

## Two-credential auth

| Credential | Where | Lifetime |
|------------|-------|----------|
| `X-Agent-Api-Key` | Parent backend / MCP env | Long-lived, rotatable |
| `Authorization: Bearer <jwt>` | Agent runtime per session | ~300s (configurable) |

```bash
# Mint token
curl -X POST http://127.0.0.1:4000/api/agent/v1/token \
  -H 'Content-Type: application/json' \
  -H 'X-Agent-Api-Key: tag_your_key' \
  -d '{"user":{"id":"agent-1"}}'

# List datasets
curl http://127.0.0.1:4000/api/agent/v1/datasets \
  -H "Authorization: Bearer <token>"
```

## Scopes

| Scope | Capability |
|-------|------------|
| `catalog:read` | List/get dashboards, datasets |
| `data:read` | Sample datasets, run connector queries (capped) |
| `auto_bi` | Analyze schema, suggest charts |
| `dashboard:write` | Create/update dashboards |
| `dashboard:publish` | Publish/unpublish |
| `embed:mint` | Mint viewer embed tokens |

## Generate a dashboard (full pipeline)

```bash
curl -X POST http://127.0.0.1:4000/api/agent/v1/auto-bi/generate \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{"datasetId":"YOUR_DATASET_ID","projectName":"Agent Dashboard","autoSuggest":true}'
```

Returns `{ dashboardId, editorUrl }`.

## MCP (Cursor)

```bash
cd packages/tinix-mcp && npm install && npm run build
```

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "tinix": {
      "command": "node",
      "args": ["packages/tinix-mcp/dist/index.js"],
      "env": {
        "TINIX_BASE_URL": "http://127.0.0.1:4000",
        "TINIX_AGENT_API_KEY": "tag_your_key"
      }
    }
  }
}
```

Example tool calls: `tinix_list_datasets`, `tinix_generate_dashboard`, `tinix_publish_dashboard`.

## OpenAPI

Spec: [docs/openapi/agent-v1.yaml](openapi/agent-v1.yaml) — served at `/docs/openapi/agent-v1.yaml` when the backend is running.

## Safety

- Row cap: 200 rows per sample/query
- Rate limit: 100 requests / 15 min per API key
- Audit log: `GET /api/agent/v1/audit`
- API keys never in browser or LLM context

## Environment

See `.env.example`: `AGENT_TOKEN_TTL_SECONDS`, optional `AGENT_JWT_SECRET` (falls back to `EMBED_JWT_SECRET`).
