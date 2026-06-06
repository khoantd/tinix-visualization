# Deploy TiniX Visualization on Vercel (core features)

This guide covers deploying the Vue frontend and Express API on Vercel with **Neon PostgreSQL** as the cloud database. The first Vercel release runs in **core mode**: projects, datasets (upload), templates, settings, and private photos.

Auto-BI, data connectors, embed publishing, and the Agent API are disabled until you run locally with `TINIX_FEATURES=full` or extend the deployment later.

## Prerequisites

- [Vercel](https://vercel.com) account
- [Neon](https://neon.tech) project with a PostgreSQL database
- Git repository connected to Vercel

## 1. Set up Neon

1. Create a Neon project and database.
2. Copy the **pooled** connection string (recommended for serverless). It looks like:
   ```
   postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
   ```
3. Apply the schema locally once:

```bash
npm install --prefix server
DATABASE_URL="postgresql://..." npm run migrate:neon
```

## 2. Configure Vercel

Import the repo in Vercel (root directory = repository root). Vercel reads [`vercel.json`](../vercel.json):

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Install command:** `npm install && npm install --prefix server`

### Environment variables

| Variable | Value | Required |
|----------|-------|----------|
| `DATABASE_URL` | Neon pooled connection string | Yes |
| `TINIX_FEATURES` | `core` | Yes |
| `HUSKY` | `0` | Recommended (skip git hooks on build) |

Optional later (not needed for core v1): `OPENROUTER_API_KEY`, `CONNECTOR_SECRET`, `EMBED_JWT_SECRET`, `AGENT_JWT_SECRET`.

## 3. Deploy

Push to your connected branch or run:

```bash
npx vercel --prod
```

## 4. Verify

After deploy, check the health endpoint:

```bash
curl https://YOUR_PROJECT.vercel.app/api/health
```

Expected response:

```json
{
  "status": "ok",
  "features": "core",
  "database": "neon"
}
```

Smoke-test in the UI:

1. Create a project
2. Upload a small JSON/CSV dataset (< 4 MB)
3. Open Template Market and use a template
4. Save system settings

Disabled routes return `501`, for example:

```bash
curl -X POST https://YOUR_PROJECT.vercel.app/api/auto-bi/analyze
```

## Architecture

```
Browser → Vercel static (dist/)
Browser → /api/* → Vercel Function (api/index.js → server/app.js)
                              ↓
                         Neon PostgreSQL
```

Hash-based routing (`/#/...`) requires no SPA fallback rewrites on Vercel.

## Known limits (core v1)

| Limit | Detail |
|-------|--------|
| Request body size | **4.5 MB** max per Vercel Function request |
| Auto-BI | Not mounted (`501`) |
| Connectors / Query Lab | Not mounted (`501`) |
| Embed / Agent API | Not mounted (`501`) |
| Connector-backed datasets | Upload-only datasets in core mode |

For large files, use smaller datasets or plan a future Vercel Blob integration.

## Local development

### Core mode (same as Vercel)

```bash
cp .env.example .env
# Set DATABASE_URL to Neon and TINIX_FEATURES=core
npm install --prefix server
npm run migrate:neon
TINIX_FEATURES=core npm run dev:all
```

### Full mode (SQLite + all features)

```bash
TINIX_FEATURES=full npm run dev:all
```

Uses local `server/database.sqlite` via `better-sqlite3` and enables Auto-BI, connectors, embed, and Agent API.

## Phase 2 — Auto-BI, Connectors, Embed, Agent

To enable the remaining features on Vercel + Neon (not just local SQLite), follow the implementation plan in [vercel-deployment-phase2.md](./vercel-deployment-phase2.md). Summary:

1. Migrate `embed.service.js` and `agent.service.js` to async Postgres.
2. Port extended routes from `full.routes.js` into modular Neon route files.
3. Set `TINIX_FEATURES=full` and add AI/connector/embed/agent env vars on Vercel.
4. Increase `maxDuration` to 60–120s for Auto-BI LLM calls.
5. Replace in-memory Agent idempotency cache with a Neon table.

## Enable full features on a dedicated server (alternative)

Run the Express backend on a VPS or container with `TINIX_FEATURES=full` and SQLite (or migrate extended routes to Postgres). Set the frontend `VITE_PRO_PATH` to that API URL if hosted separately.
