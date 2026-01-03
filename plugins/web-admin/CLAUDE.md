# @stacksolo/plugin-web-admin

Web-based admin UI plugin for StackSolo. Provides a visual interface for managing projects, deployments, and local development environments.

## Structure

```
plugins/web-admin/
├── src/
│   └── index.ts       # Plugin registration (services only, no resources)
├── app/               # SvelteKit application
│   ├── src/
│   │   ├── lib/
│   │   │   ├── cli.ts           # CLI integration utilities
│   │   │   ├── components/      # Svelte components
│   │   │   └── stores/          # Svelte stores
│   │   └── routes/
│   │       ├── +layout.svelte   # App shell with sidebar
│   │       ├── +page.svelte     # Dashboard
│   │       ├── resources/       # Resource management
│   │       ├── deploy/          # Deploy controls
│   │       ├── local/           # Local dev management
│   │       ├── config/          # Config editor
│   │       └── api/             # SvelteKit API routes
│   ├── tailwind.config.js
│   └── package.json
├── package.json
└── CLAUDE.md
```

## Key Concepts

### CLI Integration

The web admin executes StackSolo CLI commands via `$lib/cli.ts`:

- `execCLI(args)` - Execute command and return result
- `streamCLI(args, onData, onComplete)` - Stream output for long-running commands
- `parseJSONOutput(result)` - Parse JSON from CLI `--json` flag output

### API Routes

All data comes from SvelteKit API routes that call CLI commands:

- `GET /api/project` - Project status via `stacksolo status --json`
- `GET /api/resources` - Resource list from status
- `GET /api/resources/[id]/logs` - Resource logs via `stacksolo logs`
- `GET /api/deploy` - SSE stream for deploy via `stacksolo deploy`
- `GET /api/deploy/history` - Deployment history
- `GET /api/local/status` - Local dev status via `stacksolo dev --health`
- `POST /api/local/start` - Start local dev
- `POST /api/local/stop` - Stop local dev
- `GET /api/local/logs` - SSE stream for dev logs
- `GET/PUT /api/config` - Read/write config file
- `POST /api/config/validate` - Validate config syntax

### SSE Streaming

Long-running operations use Server-Sent Events for real-time updates:

```typescript
// API route
const stream = new ReadableStream({
  start(controller) {
    streamCLI(['deploy'], (line) => {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ message: line })}\n\n`));
    }, (code) => {
      controller.close();
    });
  }
});
return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });

// Client
const es = new EventSource('/api/deploy');
es.onmessage = (e) => console.log(JSON.parse(e.data));
```

## Components

- `Sidebar.svelte` - Fixed 192px navigation sidebar
- `Header.svelte` - Top bar with project info and status
- `StatCard.svelte` - Dashboard stat display card
- `LogViewer.svelte` - Auto-scrolling log display with line coloring

## Stores

- `projectStatus` - Current project state from CLI
- `resourceCounts` - Derived counts by resource type
- `localDevStatus` - Local dev running state
- `deployments` - Deployment history
- `isLoading`, `error` - UI state

## Styling

Uses Tailwind CSS with custom dark theme colors defined in `tailwind.config.js`:

```javascript
colors: {
  bg: { DEFAULT: '#0f0f0f', secondary: '#1a1a1a', tertiary: '#242424' },
  border: '#333',
  primary: { DEFAULT: '#3b82f6', hover: '#2563eb' },
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
}
```

## Environment Variables

- `STACKSOLO_PROJECT_PATH` - Path to user's project (injected by CLI)
- `NODE_ENV` - development/production

## Build

```bash
# Plugin (registers service)
pnpm --filter @stacksolo/plugin-web-admin build

# App (SvelteKit)
cd plugins/web-admin/app && pnpm build
```

## Usage

Enable in user's `stacksolo.config.ts`:

```typescript
export default defineConfig({
  webAdmin: {
    enabled: true,
    port: 3000,
  },
});
```

Then `stacksolo dev` will start the web admin alongside other services.
