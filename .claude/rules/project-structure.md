# TiniX Visualization — Project Structure

## Repository layout

```
tinix-visualization/
├── .cursor/                    # Cursor agent config (rules, commands, skills)
├── .claude/                    # Claude Code config (mirror of .cursor/)
├── .kiro/                      # Kiro config (steering, commands)
├── .agent/                     # Cross-tool session handoff (SESSION.md)
│
├── src/                        # Vue 3 frontend application
│   ├── main.ts                 # App entry: plugins, router, Pinia, i18n
│   ├── App.vue
│   │
│   ├── views/                  # Route-level pages
│   │   ├── project/            # Project hub
│   │   │   ├── items/          # My projects list
│   │   │   ├── mtTemplate/     # User templates
│   │   │   ├── templateMarket/ # System template market
│   │   │   ├── dataManagement/ # Dataset library + AutoBIWizard
│   │   │   └── layout/         # Project sidebar layout
│   │   ├── chart/              # Dashboard editor
│   │   │   ├── ContentEdit/    # Canvas, drag-drop, tools
│   │   │   ├── ContentLayers/  # Layer panel
│   │   │   ├── ContentConfigurations/  # Right panel (data, events, style)
│   │   │   ├── ContentHeader/  # Save, preview, undo
│   │   │   └── hooks/          # useSync, useContextMenu, useKeyboard
│   │   ├── preview/            # Read-only published viewer
│   │   ├── edit/               # JSON config editor
│   │   ├── login/
│   │   └── exception/          # 403, 404, 500 pages
│   │
│   ├── packages/               # Chart component library (core extensibility point)
│   │   ├── index.ts            # createComponent, fetchChartComponent, packagesList
│   │   ├── index.d.ts          # ConfigType, PackagesCategoryEnum, ChartFrameEnum
│   │   ├── components/
│   │   │   ├── Charts/         # ECharts: Bars, Lines, Pies, Maps, Scatters, Mores
│   │   │   ├── VChart/         # VisActor VChart wrappers
│   │   │   ├── Decorates/      # Borders, animations, Three.js, flow charts
│   │   │   ├── Informations/   # Text, inputs, video, iframe
│   │   │   ├── Tables/         # Scroll board, table list
│   │   │   ├── Photos/         # Image library
│   │   │   └── Icons/          # Icon components
│   │   ├── chartConfiguration/ # Shared ECharts/VChart option builders
│   │   └── public/             # PublicGroupConfigClass, shared config base
│   │
│   ├── store/
│   │   ├── index.ts            # setupStore
│   │   └── modules/
│   │       ├── chartEditStore/     # Editor canvas + component list (central)
│   │       ├── chartHistoryStore/  # Undo/redo
│   │       ├── chartLayoutStore/   # Panel layout
│   │       ├── packagesStore/      # Private photos
│   │       ├── settingStore/       # Global settings
│   │       ├── designStore/        # Design preferences
│   │       └── langStore/          # Language
│   │
│   ├── api/
│   │   ├── axios.ts            # HTTP client instance
│   │   ├── http.ts             # customizeHttp, request helpers
│   │   ├── storage.api.ts      # All SQLite-backed CRUD + Auto-BI APIs
│   │   └── mock/               # vite-plugin-mock JSON fixtures
│   │
│   ├── components/             # Shared UI (GoAppProvider, GoVChart, Pages/*)
│   ├── router/
│   │   ├── index.ts
│   │   ├── router-guards.ts
│   │   └── modules/            # project, chart, preview, edit routers
│   ├── settings/               # chartThemes, designSetting, vchartThemes
│   ├── hooks/                  # useChartDataFetch, useChartDataPondFetch
│   ├── enums/                  # pageEnum, editPageEnum, httpEnum
│   ├── i18n/                   # Locale files
│   ├── styles/                 # Global SCSS
│   ├── utils/                  # Helpers (UUID, loading, theme, migration)
│   └── plugins/                # Naive UI, directives, custom components
│
├── server/                     # Express + SQLite backend
│   ├── index.js                # REST API routes
│   ├── db.js                   # Schema init + DB connection
│   ├── ai.service.js           # OpenRouter Auto-BI
│   ├── database.sqlite         # Generated at runtime (gitignored)
│   └── package.json            # Server-only deps
│
├── plop/                       # Code generator (Pinia store scaffold)
├── build/                      # Vite build constants (OUTPUT_DIR, rollup)
├── public/                     # Static assets
├── vite.config.ts
├── package.json
├── AGENTS.md                   # AI agent entry point (this project)
└── README.md
```

---

## Data flow

```
User action (editor UI)
  → Pinia store (chartEditStore)
  → Component render (packages/components)
  → Data fetch hook (useChartDataFetch / customizeHttp)
  → axios (/api/*)
  → Express route (server/index.js)
  → SQLite (server/db.js)
```

Preview/publish path bypasses the editor and loads project config directly from SQLite via `src/views/preview/utils/storage.ts`.

---

## Chart component folder convention

Each component under `src/packages/components/` follows this structure:

```
BarCommon/
├── index.ts      # ConfigType export (key, category, package, chartFrame, image)
├── config.ts     # Default option class (extends PublicConfigClass)
├── index.vue     # Render component (used on canvas + preview)
├── config.vue    # Editor configuration panel (right sidebar)
└── data.json     # Optional static sample data
```

Register new components in the parent category index, e.g. `Charts/Bars/index.ts` → `ChartList` array.

---

## File naming conventions

| Pattern | Example | Use for |
|---------|---------|---------|
| PascalCase folder | `BarCommon/` | Chart components, view subfolders |
| `index.ts` / `index.vue` | `ContentEdit/index.vue` | Barrel entry points |
| `*.hook.ts` | `useSync.hook.ts` | Composable hooks |
| `*.d.ts` | `chartEditStore.d.ts` | Store/type declarations |
| `*.api.ts` | `storage.api.ts` | API client modules |
| kebab-case route files | `project.router.ts` | Router modules |
| SCSS partials | `_variables.scss` | Style files under `src/styles/` |

Path alias: `@/` maps to `src/` (configured in `vite.config.ts` and `tsconfig`).

---

## Layer responsibilities

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **Views** | `src/views/` | Page composition, route params, feature UI |
| **Stores** | `src/store/modules/` | Reactive app state, editor mutations |
| **Packages** | `src/packages/` | Pluggable chart/decoration components |
| **API client** | `src/api/` | HTTP calls to backend; no business logic |
| **Server routes** | `server/index.js` | REST handlers, validation, SQLite I/O |
| **Server DB** | `server/db.js` | Schema, migrations via `CREATE TABLE IF NOT EXISTS` |

**Do not** add Express-style `controllers/`, `services/`, `repositories/` folders — this project uses flat route handlers in `server/index.js`.

---

## Environment files

| File | Purpose |
|------|---------|
| `.env` | Local secrets (gitignored) — `OPENROUTER_API_KEY`, etc. |
| `.env.example` | Committed template with placeholder values |
| `import.meta.env.VITE_*` | Frontend env vars (if added) |

Server reads env via `dotenv` in `server/ai.service.js`. Never commit real keys.

---

## Tests and docs

- No dedicated `tests/` directory yet; lint via `npm run lint`.
- User docs: `README.md`, `CHANGELOG.md`.
- Agent docs: `AGENTS.md`, `.cursor/CURSOR.md`.
