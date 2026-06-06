#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { agentFetch, getCachedScopes, mintEmbedToken } from './client.js';

const TOOL_DEFS = [
  {
    name: 'tinix_list_dashboards',
    description: 'List all dashboards with summary metadata (id, title, published status).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    scope: 'catalog:read',
  },
  {
    name: 'tinix_get_dashboard',
    description: 'Get dashboard metadata by id. Set full=true for complete project JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        dashboardId: { type: 'string' },
        full: { type: 'boolean' },
      },
      required: ['dashboardId'],
      additionalProperties: false,
    },
    scope: 'catalog:read',
  },
  {
    name: 'tinix_list_datasets',
    description: 'List datasets (metadata only, no full content).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    scope: 'catalog:read',
  },
  {
    name: 'tinix_get_dataset_schema',
    description: 'Get dataset schema with sample rows for analysis.',
    inputSchema: {
      type: 'object',
      properties: { datasetId: { type: 'string' } },
      required: ['datasetId'],
      additionalProperties: false,
    },
    scope: 'catalog:read',
  },
  {
    name: 'tinix_run_query',
    description: 'Run a bounded read-only query against a connector.',
    inputSchema: {
      type: 'object',
      properties: {
        connectorId: { type: 'string' },
        sql: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['connectorId', 'sql'],
      additionalProperties: false,
    },
    scope: 'data:read',
  },
  {
    name: 'tinix_analyze_dataset',
    description: 'Analyze sample data schema with Auto-BI AI.',
    inputSchema: {
      type: 'object',
      properties: {
        sampleData: { type: 'array' },
        provider: { type: 'string' },
      },
      required: ['sampleData'],
      additionalProperties: false,
    },
    scope: 'auto_bi',
  },
  {
    name: 'tinix_suggest_charts',
    description: 'Suggest charts from a confirmed schema.',
    inputSchema: {
      type: 'object',
      properties: {
        confirmedSchema: { type: 'object' },
        provider: { type: 'string' },
      },
      required: ['confirmedSchema'],
      additionalProperties: false,
    },
    scope: 'auto_bi',
  },
  {
    name: 'tinix_generate_dashboard',
    description: 'Full pipeline: analyze, suggest, build, and save a dashboard from a dataset.',
    inputSchema: {
      type: 'object',
      properties: {
        datasetId: { type: 'string' },
        projectName: { type: 'string' },
        theme: { type: 'string' },
        charts: { type: 'array' },
        executiveSummary: { type: 'string' },
        autoSuggest: { type: 'boolean' },
        provider: { type: 'string' },
      },
      required: ['datasetId'],
      additionalProperties: false,
    },
    scope: 'dashboard:write',
  },
  {
    name: 'tinix_create_dashboard',
    description: 'Create dashboard from explicit chart suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        datasetId: { type: 'string' },
        projectName: { type: 'string' },
        theme: { type: 'string' },
        charts: { type: 'array' },
        executiveSummary: { type: 'string' },
      },
      required: ['datasetId', 'charts'],
      additionalProperties: false,
    },
    scope: 'dashboard:write',
  },
  {
    name: 'tinix_update_dashboard',
    description: 'Partially update dashboard title or theme.',
    inputSchema: {
      type: 'object',
      properties: {
        dashboardId: { type: 'string' },
        title: { type: 'string' },
        theme: { type: 'string' },
      },
      required: ['dashboardId'],
      additionalProperties: false,
    },
    scope: 'dashboard:write',
  },
  {
    name: 'tinix_publish_dashboard',
    description: 'Publish a dashboard for authenticated embed viewing.',
    inputSchema: {
      type: 'object',
      properties: { dashboardId: { type: 'string' } },
      required: ['dashboardId'],
      additionalProperties: false,
    },
    scope: 'dashboard:publish',
  },
  {
    name: 'tinix_mint_embed_token',
    description: 'Mint a short-lived embed viewer token (requires TINIX_EMBED_API_KEY env).',
    inputSchema: {
      type: 'object',
      properties: {
        dashboardId: { type: 'string' },
        userId: { type: 'string' },
      },
      required: ['dashboardId'],
      additionalProperties: false,
    },
    scope: 'embed:mint',
  },
] as const;

async function handleTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'tinix_list_dashboards':
      return agentFetch('/dashboards');
    case 'tinix_get_dashboard': {
      const q = args.full ? '?full=1' : '';
      return agentFetch(`/dashboards/${args.dashboardId}${q}`);
    }
    case 'tinix_list_datasets':
      return agentFetch('/datasets');
    case 'tinix_get_dataset_schema':
      return agentFetch(`/datasets/${args.datasetId}/schema`);
    case 'tinix_run_query':
      return agentFetch(`/connectors/${args.connectorId}/query`, {
        method: 'POST',
        body: JSON.stringify({ sql: args.sql, limit: args.limit || 200 }),
      });
    case 'tinix_analyze_dataset':
      return agentFetch('/auto-bi/analyze', {
        method: 'POST',
        body: JSON.stringify({ sampleData: args.sampleData, provider: args.provider }),
      });
    case 'tinix_suggest_charts':
      return agentFetch('/auto-bi/suggest', {
        method: 'POST',
        body: JSON.stringify({ confirmedSchema: args.confirmedSchema, provider: args.provider }),
      });
    case 'tinix_generate_dashboard':
      return agentFetch('/auto-bi/generate', {
        method: 'POST',
        body: JSON.stringify(args),
      });
    case 'tinix_create_dashboard':
      return agentFetch('/dashboards', {
        method: 'POST',
        body: JSON.stringify(args),
      });
    case 'tinix_update_dashboard':
      return agentFetch(`/dashboards/${args.dashboardId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: args.title, theme: args.theme }),
      });
    case 'tinix_publish_dashboard':
      return agentFetch(`/dashboards/${args.dashboardId}/publish`, { method: 'POST', body: '{}' });
    case 'tinix_mint_embed_token':
      return mintEmbedToken(String(args.dashboardId), String(args.userId || 'viewer'));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

const server = new Server(
  { name: 'tinix-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    await agentFetch('/config');
  } catch {
    // Allow listing tools even if server is down (dev UX)
  }
  const scopes = getCachedScopes();
  const tools = TOOL_DEFS.filter((t) => scopes.length === 0 || scopes.includes(t.scope)).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(name, (args || {}) as Record<string, unknown>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
