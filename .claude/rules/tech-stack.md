# TiniX Visualization — Technology Stack

> Approved technologies for **this repository**. Do not introduce Next.js, Prisma, Redis, or Tailwind unless explicitly requested for a new sub-project.

---

## Stack overview

| Layer | Choice | Notes |
|-------|--------|-------|
| **Frontend framework** | Vue 3.5 + Composition API | `<script setup>` or `defineComponent`; match surrounding files |
| **Build** | Vite 4 | Config in `vite.config.ts`; alias `@` → `src/` |
| **Language** | TypeScript 4.6 | Strict typing for stores, hooks, API layers |
| **UI library** | Naive UI 2.x | Do not add shadcn, MUI, or Element Plus |
| **Styling** | SCSS | Global mixins via `src/styles/common/style.scss`; no Tailwind |
| **State** | Pinia | One store per domain under `src/store/modules/` |
| **Routing** | vue-router 4 | Hash history; route modules in `src/router/modules/` |
| **i18n** | vue-i18n 9 | Keys in locale files; some labels use `window['$t']` |
| **Charts — primary** | ECharts 5 + vue-echarts | Most components use `ChartFrameEnum.ECHARTS` |
| **Charts — secondary** | @visactor/vchart | VChart components under `src/packages/components/VChart/` |
| **3D decorates** | Three.js | Used in `Decorates/Three/` only |
| **HTTP client** | axios | Single instance in `src/api/axios.ts`; baseURL `/api` |
| **Backend** | Express 4 (`server/`) | CommonJS; no Nest/Fastify |
| **Database** | better-sqlite3 | Local file `server/database.sqlite`; no Postgres/MySQL for app data |
| **AI** | OpenRouter or LiteLLM proxy | `server/ai.config.js`; env `AI_PROVIDER`, provider-specific keys |

---

## Frontend conventions

```ts
// ✅ Pinia store pattern
export const useChartEditStore = defineStore({ id: 'useChartEditStore', state: () => ({ ... }) })

// ✅ API call via storage.api.ts
const data = await getProjectsApi()

// ✅ Path alias
import { useChartEditStore } from '@/store/modules/chartEditStore/chartEditStore'
```

- Use **lodash** (`cloneDeep`, `debounce`), **dayjs**, **mitt** event bus — already in the project.
- Editor utilities: **keymaster** (shortcuts), **vue3-sketch-ruler** (canvas ruler), **vuedraggable** (drag-drop).
- Code editor panels: **monaco-editor** via `vite-plugin-monaco-editor`.
- Do not add **Zustand**, **Redux**, **TanStack Query**, or **SWR** — Pinia + direct axios calls are the pattern.

---

## Chart component stack

When adding or modifying visualization components:

1. Follow the folder pattern in `src/packages/components/{Category}/{SubCategory}/{Name}/`.
2. Export `ConfigType` from `index.ts`; default options class from `config.ts`.
3. Register in the parent category `index.ts` (e.g. `Charts/Bars/index.ts`).
4. Choose the correct `chartFrame`: `ECHARTS`, `VCHART`, `STATIC`, or `COMMON` (see `src/packages/index.d.ts`).
5. Reuse `src/packages/chartConfiguration/` helpers for axis, legend, label options.

**Prefer extending existing chart types** over adding new chart libraries.

---

## Backend conventions

```js
// ✅ SQLite via better-sqlite3 (synchronous)
const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)

// ✅ Upsert pattern used throughout server/index.js
INSERT INTO ... ON CONFLICT(id) DO UPDATE SET ...
```

- All REST routes live under `/api/` prefix.
- JSON columns stored as strings; parse on read, stringify on write.
- Large payloads: body-parser limit is 50mb (datasets, project configs).
- **Do not add Prisma, Sequelize, or TypeORM** for this app.

### API surface (existing)

| Prefix | Entity |
|--------|--------|
| `/api/projects` | Dashboard projects |
| `/api/datasets` | Static dataset library |
| `/api/user-templates` | User-saved templates |
| `/api/system-templates` | Template market (admin) |
| `/api/template-overrides` | Template customizations |
| `/api/system-settings` | Global settings |
| `/api/private-photos` | User photo library |
| `/api/auto-bi/providers` | List configured AI providers + active selection |
| `/api/auto-bi/analyze` | AI schema analysis |
| `/api/auto-bi/suggest` | AI chart suggestions |

---

## AI integration (Auto-BI)

- Supported providers: **OpenRouter** (`openrouter`) and **LiteLLM proxy** (`litellm`) via `server/ai.config.js`.
- Credentials in `.env` only; runtime toggle in Data Management UI persisted to `system_settings` (`ai_setting`).
- **Never** hardcode keys or log full API responses containing user data.
- Schema samples sent to AI are user-initiated via Auto-BI wizard.
- Model catalog and chart type hints live in `server/ai.service.js` (`TINIX_CATALOG`).
- To add chart types to AI suggestions, update `TINIX_CATALOG.charts` and ensure a matching component exists in `src/packages/`.

---

## Dev environment

| Service | Port | Command |
|---------|------|---------|
| Vite dev server | 3020 | `npm run dev` |
| Express API | 4000 | `npm run server` |
| Both | — | `npm run dev:all` |

Vite proxies `/api` → `http://127.0.0.1:4000`.

---

## Adding dependencies

Before proposing a new npm package:

| Check | Question |
|-------|----------|
| Necessity | Does lodash, dayjs, Naive UI, or ECharts already cover this? |
| Bundle size | Dashboard apps are chart-heavy; avoid large unused deps |
| TypeScript | Must have types or ship `@types/*` |
| License | MIT/Apache preferred |
| Security | Run `npm audit` after adding |

**Avoid:** React, Next.js, Prisma, Tailwind, Firebase, Supabase (not used in this app).

---

## Documentation references

- User-facing features: [`README.md`](../../README.md)
- Agent entry point: [`AGENTS.md`](../../AGENTS.md)
- Changelog: [`CHANGELOG.md`](../../CHANGELOG.md)
