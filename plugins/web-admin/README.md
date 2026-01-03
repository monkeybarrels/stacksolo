# @stacksolo/plugin-web-admin

A web-based admin UI for StackSolo. This plugin provides a visual interface to manage your StackSolo projects without using the command line.

## What It Does

The web admin gives you a dashboard to:

- **View Resources** - See all your cloud resources (functions, containers, databases, etc.) in one place
- **Deploy** - Run deployments with real-time log streaming
- **Local Dev** - Start/stop local development and view service logs
- **Edit Config** - Edit your `stacksolo.config.ts` with syntax validation

## Installation

The web admin is included with StackSolo. To enable it, add this to your config:

```typescript
// stacksolo.config.ts
export default defineConfig({
  // ... your other config
  webAdmin: {
    enabled: true,
    port: 3000, // optional, defaults to 3000
  },
});
```

## Usage

Once enabled, the web admin starts automatically when you run:

```bash
stacksolo dev
```

Then open http://localhost:3000 in your browser.

## Features

### Dashboard

The main dashboard shows:
- Resource counts by type (functions, containers, databases, etc.)
- Quick action buttons for common tasks
- Recent activity feed

### Resources Page

View and manage your deployed resources:
- Filter by type or search by name
- Click a resource to see details and logs
- Quick links to resource URLs

### Deploy Page

Run infrastructure deployments:
- One-click deploy button
- Real-time progress bar
- Live log streaming
- Deployment history with rollback support

### Local Dev Page

Manage your local development environment:
- Start/stop controls
- Service status table with ports and URLs
- Live log streaming with service filtering
- Resource usage (CPU, memory)

### Config Page

Edit your project configuration:
- Syntax highlighting
- Real-time validation
- Save with one click

## How It Works

The web admin is a SvelteKit app that runs as a service alongside your other local dev services. It executes StackSolo CLI commands behind the scenes and displays the results in a friendly UI.

All API endpoints call the `stacksolo` CLI:
- `/api/project` → `stacksolo status --json`
- `/api/deploy` → `stacksolo deploy` (with SSE streaming)
- `/api/local/start` → `stacksolo dev --detach`
- etc.

## Development

To work on the web admin itself:

```bash
# Install dependencies
cd plugins/web-admin/app
pnpm install

# Run dev server
pnpm dev
```

The dev server runs on http://localhost:3000 with hot reload.

## Building

```bash
# Build the plugin
pnpm --filter @stacksolo/plugin-web-admin build

# Build the SvelteKit app
cd plugins/web-admin/app
pnpm build
```

## Docker

A Dockerfile is included for production builds:

```bash
cd plugins/web-admin/app
docker build -t stacksolo-web-admin .
docker run -p 3000:3000 -e STACKSOLO_PROJECT_PATH=/project -v /your/project:/project stacksolo-web-admin
```

## Requirements

- Node.js 20+
- StackSolo CLI installed and in PATH
- A StackSolo project (with `stacksolo.config.ts`)
