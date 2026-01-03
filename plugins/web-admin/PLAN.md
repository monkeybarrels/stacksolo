# Plan: @stacksolo/plugin-web-admin

Build a web-based admin UI plugin for StackSolo that provides a visual interface for managing projects, deployments, and local development environments.

---

## Phase 1: Plugin Setup ✅
- [x] Create `plugins/web-admin/` directory structure
- [x] Create `plugins/web-admin/package.json` with plugin metadata
- [x] Create `plugins/web-admin/src/index.ts` with plugin registration
- [x] Initialize SvelteKit project in `plugins/web-admin/app/`
- [x] Configure Tailwind CSS with dark theme color palette
- [x] Create `app/src/lib/cli.ts` with `execCLI()` and `streamCLI()` functions
- [x] Add plugin to pnpm workspace
- [x] Create `plugins/web-admin/CLAUDE.md` documentation

## Phase 2: Shell & Layout ✅
- [x] Create `+layout.svelte` with sidebar + header structure
- [x] Build `Sidebar.svelte` component (192px fixed, navigation items)
- [x] Build `Header.svelte` component (project name, region, environment)
- [x] Set up navigation between routes (Dashboard, Resources, Deploy, Local Dev, Config)
- [x] Create mock project data store in `lib/stores/project.ts`
- [x] Set up basic API routes structure in `routes/api/`

## Phase 3: Dashboard ✅
- [x] Build `StatCard.svelte` component (count, label, status indicator)
- [x] Create dashboard page with 6-card grid (Functions, Containers, Databases, Storage, Cache, LB)
- [x] Build activity list component (status icon, description, timestamp)
- [x] Add quick action buttons (Deploy Now, View Logs, Open Config)
- [x] Wire to `/api/project` endpoint
- [x] Create `/api/project/+server.ts` that calls `stacksolo status --json`

## Phase 4: Resources ✅
- [x] Build `ResourceTable.svelte` component with type icons
- [x] Add filter dropdown and search input
- [x] Implement row selection with detail panel
- [x] Add action buttons (refresh, logs, delete) with hover states
- [x] Create `/api/resources/+server.ts` endpoint
- [x] Create `/api/resources/[id]/logs/+server.ts` endpoint

## Phase 5: Deploy ✅
- [x] Build `DeployProgress.svelte` component (status badge, progress bar, ETA)
- [x] Build `LogViewer.svelte` component (monospace, auto-scroll, line coloring)
- [x] Create deploy page with progress section and log viewer
- [x] Build deployment history list with rollback buttons
- [x] Create `/api/deploy/+server.ts` with SSE streaming
- [x] Create `/api/deploy/history/+server.ts` endpoint
- [x] Wire frontend to consume SSE stream for real-time updates

## Phase 6: Local Dev ✅
- [x] Build status bar component (running state, uptime, CPU, memory)
- [x] Build services table (name, status, port, clickable URL)
- [x] Add service selector dropdown for log filtering
- [x] Integrate LogViewer component with service prefix
- [x] Create `/api/local/status/+server.ts` (calls `stacksolo dev --health --ports --json`)
- [x] Create `/api/local/start/+server.ts` endpoint
- [x] Create `/api/local/stop/+server.ts` endpoint
- [x] Create `/api/local/logs/+server.ts` with SSE streaming

## Phase 7: Config ✅
- [x] Build `ConfigEditor.svelte` component (textarea with line numbers)
- [x] Add validation status indicator (Valid/Invalid with colored dot)
- [x] Display validation error messages below editor
- [x] Add Save and Validate buttons
- [x] Create `/api/config/+server.ts` (GET and PUT)
- [x] Create `/api/config/validate/+server.ts` endpoint

## Phase 8: CLI Integration ✅
- [x] Update CLI dev command to detect `webAdmin.enabled` in config
- [x] Add `WebAdminConfig` interface to blueprint schema
- [x] Implement `startWebAdmin()` function in dev command
- [x] Inject `STACKSOLO_PROJECT_PATH` environment variable
- [x] Add web admin port to displayed services list

## Phase 9: Polish ✅
- [x] Add loading states (skeletons, spinners) to all data-fetching components
- [x] Add error states with retry buttons
- [x] Add empty states for no resources, no deployments, etc.
- [x] Create Dockerfile for production builds
- [x] Update `plugins/web-admin/README.md` with usage instructions

---

## Summary

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Plugin Setup | ✅ Complete |
| 2 | Shell & Layout | ✅ Complete |
| 3 | Dashboard | ✅ Complete |
| 4 | Resources | ✅ Complete |
| 5 | Deploy | ✅ Complete |
| 6 | Local Dev | ✅ Complete |
| 7 | Config | ✅ Complete |
| 8 | CLI Integration | ✅ Complete |
| 9 | Polish | ✅ Complete |

---

## Next Steps

1. CLI Integration: Update CLI to detect `webAdmin.enabled` and start the service
2. Polish: Add loading skeletons, animations, and keyboard shortcuts
3. Testing: Test the full integration flow with a real project
