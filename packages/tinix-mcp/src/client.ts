const BASE_URL = process.env.TINIX_BASE_URL || 'http://127.0.0.1:4000';
const API_KEY = process.env.TINIX_AGENT_API_KEY || '';

let cachedToken: { token: string; expiresAt: number; scopes: string[] } | null = null;

async function mintToken(): Promise<string> {
  if (!API_KEY) {
    throw new Error('TINIX_AGENT_API_KEY is required');
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }
  const res = await fetch(`${BASE_URL}/api/agent/v1/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Api-Key': API_KEY,
    },
    body: JSON.stringify({ user: { id: 'mcp-server' } }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Token mint failed: ${res.status}`);
  }
  const data = await res.json() as { token: string; expiresIn: number; scopes: string[] };
  cachedToken = {
    token: data.token,
    expiresAt: Date.now() + data.expiresIn * 1000,
    scopes: data.scopes,
  };
  return data.token;
}

export async function agentFetch(path: string, options: RequestInit = {}) {
  const token = await mintToken();
  const res = await fetch(`${BASE_URL}/api/agent/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { message?: string }).message || `Request failed: ${res.status}`);
  }
  return body;
}

export function getCachedScopes(): string[] {
  return cachedToken?.scopes || [];
}

export async function mintEmbedToken(dashboardId: string, userId = 'viewer') {
  const embedKey = process.env.TINIX_EMBED_API_KEY;
  if (!embedKey) throw new Error('TINIX_EMBED_API_KEY is required for embed token minting');
  const token = await mintToken();
  const res = await fetch(`${BASE_URL}/api/agent/v1/embed/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Embed-Api-Key': embedKey,
    },
    body: JSON.stringify({ dashboardId, user: { id: userId } }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { message?: string }).message || `Embed mint failed: ${res.status}`);
  }
  return body;
}
