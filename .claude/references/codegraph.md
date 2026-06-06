# CodeGraph reference

[CodeGraph](https://github.com/colbymchenry/codegraph) is a local, tree-sitter–parsed knowledge graph exposed to agents via MCP.

## Claude Code setup

**class-ai-agent** does not write Claude MCP config. Install CodeGraph for Claude Code globally:

```bash
npx @colbymchenry/codegraph
# or: npm i -g @colbymchenry/codegraph
codegraph install --target=claude --yes
```

In each project, build the index:

```bash
codegraph init -i
```

If you used **class-ai-agent** to scaffold the project, it may have already run `init -i` and created `.codegraph/` (shared by any agent that uses the index).

## Cursor (via class-ai-agent)

- `.cursor/mcp.json` — CodeGraph MCP server
- `.cursor/rules/codegraph.mdc` — when to use `codegraph_*` tools

Reload Cursor after install. See `.cursor/references/codegraph.md`.

## Kiro (via class-ai-agent)

- `.kiro/settings/mcp.json` — CodeGraph MCP server
- `.kiro/steering/codegraph.md` — when to use `codegraph_*` tools

Restart Kiro after install. See `.kiro/references/codegraph.md`.

Or install globally: `codegraph install --target=kiro --yes`

## Requirements

- **Node 20+** recommended for CodeGraph.
- Index data lives in `.codegraph/` — add to `.gitignore` (class-ai-agent does this automatically).

## Troubleshooting

| Issue | Action |
|-------|--------|
| `task must be a non-empty string` | On `codegraph_context`, use **`task`** (not `query`) and **`maxNodes`** (not `limit`). For `/resume`, read `.agent/SESSION.md` — not CodeGraph. |

See [CodeGraph README — Troubleshooting](https://github.com/colbymchenry/codegraph#troubleshooting) or `.cursor/references/codegraph.md` for MCP setup.
