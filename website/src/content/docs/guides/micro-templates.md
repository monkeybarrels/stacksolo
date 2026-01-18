---
title: Micro-Templates
description: Build modular applications with shells, features, and single-purpose components
---

import { Tabs, TabItem } from '@astrojs/starlight/components';

Micro-templates let you build applications piece by piece. Instead of starting with a monolithic template, you can compose exactly what you need.

## Why Modular Architecture?

As applications grow, managing code in a single codebase becomes challenging:

| Problem | Solution |
|---------|----------|
| Teams stepping on each other | Each team owns their feature package |
| Slow builds and tests | Features build independently |
| Unclear boundaries | Explicit package dependencies |
| Hard to add new features | `stacksolo add feature-module` handles wiring |

## Template Types

| Type | Purpose | Command |
|------|---------|---------|
| **Shell** | Monorepo foundation with auth, layout, routing | `stacksolo init --template app-shell` |
| **Feature** | Add a feature package to existing shell | `stacksolo add feature-module --name xyz` |
| **Function** | Backend function (Stripe, AI, etc.) | `stacksolo add stripe-webhook` |
| **UI** | Frontend pages or layouts | `stacksolo add auth-pages` |

## Framework Support

Shell and feature templates support both **Vue** and **React**:

| Flag | Framework | State Management | Routing |
|------|-----------|------------------|---------|
| `--vue` (default) | Vue 3 | Pinia | Vue Router |
| `--react` | React 18 | Zustand | React Router |

Both frameworks include:
- Firebase Authentication
- Tailwind CSS
- TypeScript
- Vite build

## Quick Start: Build a Modular App

### Step 1: Create the Shell

```bash
# Create with Vue (default)
stacksolo init --template app-shell --name myorg

# Or create with React
stacksolo init --template app-shell --name myorg --react

# You'll be prompted for:
# - Project name (e.g., "my-app")
# - npm org scope (e.g., "myorg" → packages become @myorg/shell)
```

This creates:

```
my-app/
├── packages/
│   ├── shell/              # Core app with auth and routing
│   ├── shared/             # Shared components and stores
│   └── feature-dashboard/  # Default feature package
├── pnpm-workspace.yaml     # Monorepo configuration
└── package.json
```

### Step 2: Run Locally

```bash
cd my-app
pnpm install
pnpm --filter shell dev
```

Open http://localhost:5173 to see:
- Login page with Firebase Authentication
- Dashboard (after logging in)
- Sidebar navigation

### Step 3: Add Feature Packages

```bash
# Add an inventory management feature
stacksolo add feature-module --name inventory

# Add a reports feature
stacksolo add feature-module --name reports

# Add a settings feature
stacksolo add feature-module --name settings
```

Each command automatically:
1. Creates `packages/feature-<name>/` with components and store (Vue or React, auto-detected from shell)
2. Adds `@myorg/feature-<name>: workspace:*` to shell's dependencies
3. Updates shell's router to import and register the feature's routes

**Framework auto-detection:** The CLI detects your shell's framework from `packages/shell/package.json` and creates matching features.

### Step 4: Verify It Works

```bash
pnpm install
pnpm --filter shell dev
```

Visit:
- http://localhost:5173/inventory
- http://localhost:5173/reports
- http://localhost:5173/settings

All features appear in the sidebar automatically.

---

## Shell Template Deep Dive

### What You Get

The `app-shell` template creates a production-ready monorepo. The structure is similar for both Vue and React:

<Tabs>
<TabItem label="Vue">
```
packages/
├── shell/                        # Main application shell
│   ├── src/
│   │   ├── App.vue              # Root component
│   │   ├── main.ts              # Entry point
│   │   ├── core/
│   │   │   ├── router/
│   │   │   │   └── index.ts     # Feature route registration
│   │   │   ├── stores/
│   │   │   │   ├── auth.ts      # Firebase auth state (Pinia)
│   │   │   │   └── shell.ts     # Navigation, theme
│   │   │   ├── layouts/
│   │   │   │   └── ShellLayout.vue  # Sidebar + header
│   │   │   └── lib/
│   │   │       └── firebase.ts  # Firebase configuration
│   │   └── pages/
│   │       └── Login.vue        # Login page
│   ├── package.json             # @myorg/shell
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── shared/                       # Shared code across features
│   ├── src/
│   │   ├── components/
│   │   │   ├── Button.vue
│   │   │   ├── Card.vue
│   │   │   └── LoadingSpinner.vue
│   │   ├── composables/
│   │   │   └── useCurrentUser.ts
│   │   └── stores/
│   │       └── notifications.ts
│   └── package.json             # @myorg/shared
│
└── feature-dashboard/           # Default feature (example)
    ├── src/
    │   ├── pages/
    │   │   └── DashboardPage.vue
    │   ├── components/
    │   │   └── StatsCard.vue
    │   ├── stores/
    │   │   └── dashboard.ts
    │   └── index.ts             # Exports routes
    └── package.json             # @myorg/feature-dashboard
```
</TabItem>
<TabItem label="React">
```
packages/
├── shell/                        # Main application shell
│   ├── src/
│   │   ├── App.tsx              # Root component
│   │   ├── main.tsx             # Entry point
│   │   ├── core/
│   │   │   ├── router/
│   │   │   │   └── index.tsx    # Feature route registration
│   │   │   ├── stores/
│   │   │   │   ├── auth.ts      # Firebase auth state (Zustand)
│   │   │   │   └── shell.ts     # Navigation, theme
│   │   │   ├── layouts/
│   │   │   │   └── ShellLayout.tsx  # Sidebar + header
│   │   │   └── lib/
│   │   │       └── firebase.ts  # Firebase configuration
│   │   └── pages/
│   │       └── Login.tsx        # Login page
│   ├── package.json             # @myorg/shell
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── shared/                       # Shared code across features
│   ├── src/
│   │   ├── components/
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   └── LoadingSpinner.tsx
│   │   ├── hooks/
│   │   │   └── useCurrentUser.ts
│   │   └── stores/
│   │       └── notifications.ts
│   └── package.json             # @myorg/shared
│
└── feature-dashboard/           # Default feature (example)
    ├── src/
    │   ├── pages/
    │   │   └── DashboardPage.tsx
    │   ├── components/
    │   │   └── StatsCard.tsx
    │   ├── stores/
    │   │   └── dashboard.ts
    │   └── index.ts             # Exports routes
    └── package.json             # @myorg/feature-dashboard
```
</TabItem>
</Tabs>

### Router Integration

The shell router dynamically imports feature routes. The pattern is the same for both frameworks:

<Tabs>
<TabItem label="Vue">
```typescript
// packages/shell/src/core/router/index.ts
import { routes as dashboardRoutes } from '@myorg/feature-dashboard';
import { routes as inventoryRoutes } from '@myorg/feature-inventory';

const featureRoutes = [
  ...dashboardRoutes,
  ...inventoryRoutes,
];

const routes = [
  { path: '/login', component: Login },
  {
    path: '/',
    component: ShellLayout,
    meta: { requiresAuth: true },
    children: featureRoutes,
  },
];
```
</TabItem>
<TabItem label="React">
```typescript
// packages/shell/src/core/router/index.tsx
import { routes as dashboardRoutes } from '@myorg/feature-dashboard';
import { routes as inventoryRoutes } from '@myorg/feature-inventory';

const featureRoutes = [
  ...dashboardRoutes,
  ...inventoryRoutes,
];

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: <ShellLayout />,
    children: featureRoutes,
  },
]);
```
</TabItem>
</Tabs>

When you run `stacksolo add feature-module --name xyz`, the CLI automatically adds the import and spread.

### Firebase Authentication

The shell includes complete Firebase Auth:

```typescript
// packages/shell/src/core/lib/firebase.ts
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  // Add your Firebase config here
};
```

**Supported auth methods:**
- Google sign-in
- Email/password
- Auth state persistence across sessions

**Protected routes:** All routes under ShellLayout require authentication. Unauthenticated users are redirected to `/login`.

---

## Feature Template Deep Dive

### What Gets Created

When you run `stacksolo add feature-module --name inventory`:

<Tabs>
<TabItem label="Vue">
```
packages/feature-inventory/
├── src/
│   ├── pages/
│   │   └── InventoryPage.vue    # Main page component
│   ├── components/
│   │   └── InventoryCard.vue    # Feature-specific component
│   ├── stores/
│   │   └── inventory.ts         # Pinia store for feature state
│   └── index.ts                 # Public exports (routes, components)
└── package.json                 # @myorg/feature-inventory
```
</TabItem>
<TabItem label="React">
```
packages/feature-inventory/
├── src/
│   ├── pages/
│   │   └── InventoryPage.tsx    # Main page component
│   ├── components/
│   │   └── InventoryCard.tsx    # Feature-specific component
│   ├── stores/
│   │   └── inventory.ts         # Zustand store for feature state
│   └── index.ts                 # Public exports (routes, components)
└── package.json                 # @myorg/feature-inventory
```
</TabItem>
</Tabs>

### Feature Exports

Each feature must export its routes:

<Tabs>
<TabItem label="Vue">
```typescript
// packages/feature-inventory/src/index.ts
import type { RouteRecordRaw } from 'vue-router';
import InventoryPage from './pages/InventoryPage.vue';

export const routes: RouteRecordRaw[] = [
  {
    path: '/inventory',
    name: 'inventory',
    component: InventoryPage,
    meta: {
      title: 'Inventory',
      icon: 'package',  // Used by sidebar
    },
  },
];

// Optionally export components for cross-feature use
export { InventoryPage };
export { InventoryCard } from './components/InventoryCard.vue';
export { useInventoryStore } from './stores/inventory';
```
</TabItem>
<TabItem label="React">
```typescript
// packages/feature-inventory/src/index.ts
import type { RouteObject } from 'react-router-dom';

export const routes: RouteObject[] = [
  {
    path: '/inventory',
    lazy: async () => {
      const { InventoryPage } = await import('./pages/InventoryPage');
      return { Component: InventoryPage };
    },
  },
];

// Feature metadata for sidebar
export const meta = {
  title: 'Inventory',
  icon: 'package',
};

// Optionally export components for cross-feature use
export { InventoryPage } from './pages/InventoryPage';
export { InventoryCard } from './components/InventoryCard';
export { useInventoryStore } from './stores/inventory';
```
</TabItem>
</Tabs>

### Shell Updates

The CLI modifies two files in the shell:

**1. package.json** - Adds workspace dependency:
```json
{
  "dependencies": {
    "@myorg/feature-inventory": "workspace:*"
  }
}
```

**2. router/index.ts** - Adds import and spread:
```typescript
import { routes as inventoryRoutes } from '@myorg/feature-inventory';
// ...
const featureRoutes = [
  ...dashboardRoutes,
  ...inventoryRoutes,  // Added automatically
];
```

---

## Cross-Feature Communication

Features should be loosely coupled. Communicate through the shared package:

### Shared Stores

<Tabs>
<TabItem label="Vue (Pinia)">
```typescript
// packages/shared/src/stores/notifications.ts
import { defineStore } from 'pinia';

export const useNotificationStore = defineStore('notifications', {
  state: () => ({
    items: [] as Array<{ id: number; message: string; type: string }>,
  }),
  actions: {
    show(message: string, type: 'success' | 'error' | 'info' = 'info') {
      this.items.push({ id: Date.now(), message, type });
      setTimeout(() => this.items.shift(), 5000);
    },
  },
});
```
</TabItem>
<TabItem label="React (Zustand)">
```typescript
// packages/shared/src/stores/notifications.ts
import { create } from 'zustand';

interface NotificationState {
  items: Array<{ id: number; message: string; type: string }>;
  show: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  items: [],
  show: (message, type = 'info') => {
    const id = Date.now();
    set((state) => ({ items: [...state.items, { id, message, type }] }));
    setTimeout(() => {
      set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
    }, 5000);
  },
}));
```
</TabItem>
</Tabs>

**Usage in any feature:**

<Tabs>
<TabItem label="Vue">
```vue
<script setup lang="ts">
import { useNotificationStore } from '@myorg/shared';

const notifications = useNotificationStore();

function handleSave() {
  // Save logic...
  notifications.show('Item saved!', 'success');
}
</script>
```
</TabItem>
<TabItem label="React">
```tsx
import { useNotificationStore } from '@myorg/shared';

function MyComponent() {
  const { show } = useNotificationStore();

  function handleSave() {
    // Save logic...
    show('Item saved!', 'success');
  }

  return <button onClick={handleSave}>Save</button>;
}
```
</TabItem>
</Tabs>

### Shared Components

<Tabs>
<TabItem label="Vue">
```vue
<script setup lang="ts">
import { Card, Button, LoadingSpinner } from '@myorg/shared';
</script>

<template>
  <Card>
    <h2>My Feature</h2>
    <Button @click="save">Save</Button>
  </Card>
</template>
```
</TabItem>
<TabItem label="React">
```tsx
import { Card, Button, LoadingSpinner } from '@myorg/shared';

function MyFeature() {
  return (
    <Card>
      <h2>My Feature</h2>
      <Button onClick={save}>Save</Button>
    </Card>
  );
}
```
</TabItem>
</Tabs>

### Event Bus (Advanced)

For complex cross-feature events:

```typescript
// packages/shared/src/lib/events.ts
import mitt from 'mitt';

type Events = {
  'inventory:updated': { itemId: string };
  'order:created': { orderId: string };
};

export const events = mitt<Events>();

// Feature A emits
events.emit('inventory:updated', { itemId: '123' });

// Feature B listens
events.on('inventory:updated', ({ itemId }) => {
  console.log('Inventory updated:', itemId);
});
```

---

## Function & UI Micro-Templates

Beyond shells and features, you can add standalone components to any StackSolo project.

### Available Micro-Templates

**Functions (Backend):**

| ID | Description |
|----|-------------|
| `stripe-webhook` | Handle Stripe webhook events (subscriptions, payments) |
| `stripe-checkout` | Create checkout sessions and customer portal links |
| `firebase-auth-api` | Auth middleware + profile endpoint with PostgreSQL sync |
| `chat-api` | AI chat endpoint with Vertex AI streaming (SSE) |

**UIs (Frontend):**

| ID | Description |
|----|-------------|
| `landing-page` | Marketing landing page with hero, features, pricing |
| `auth-pages` | Login and signup pages with Firebase Authentication |
| `dashboard-layout` | Sidebar + header layout for authenticated dashboards |
| `billing-page` | Subscription management UI with Stripe integration |

### Adding to a StackSolo Project

```bash
# List all available micro-templates
stacksolo add --list

# Add a function
stacksolo add stripe-webhook

# Add UI pages
stacksolo add auth-pages

# Preview changes without applying
stacksolo add stripe-webhook --dry-run
```

### What Happens

When you run `stacksolo add <micro-template-id>`:

1. **Downloads** files from the community repository
2. **Copies** source to your project (`functions/` or `apps/`)
3. **Merges** config into your `stacksolo.config.json`
4. **Shows** required secrets you need to set up

### Example: Add Stripe Payments

```bash
# Start with any StackSolo project
cd my-project

# Add Stripe webhook handling
stacksolo add stripe-webhook

# Add checkout session creation
stacksolo add stripe-checkout

# Set up required secrets
echo "sk_live_xxx" | gcloud secrets create stripe-secret-key --data-file=-
echo "whsec_xxx" | gcloud secrets create stripe-webhook-secret --data-file=-

# Deploy
stacksolo deploy
```

### Name Prefixes

Use `--name` to avoid conflicts when adding multiple instances:

```bash
# Creates apps/admin-auth/
stacksolo add auth-pages --name admin

# Creates apps/user-auth/
stacksolo add auth-pages --name user
```

---

## Troubleshooting

### "Feature package not found"

Make sure you're in the root of an app-shell monorepo:

```bash
# Should see packages/shell/
ls packages/
```

### "Router import failed"

The CLI looks for specific patterns in `packages/shell/src/core/router/index.ts`. If you've heavily modified the router, you may need to add imports manually:

```typescript
import { routes as myFeatureRoutes } from '@myorg/feature-myfeature';
// Add to featureRoutes array
```

### "pnpm install fails"

Ensure `pnpm-workspace.yaml` includes all packages:

```yaml
packages:
  - 'packages/*'
```

### "Firebase auth not working"

1. Configure Firebase in GCP Console
2. Enable Authentication providers (Google, Email/Password)
3. Update `packages/shell/src/core/lib/firebase.ts` with your config

### "Feature routes not showing in sidebar"

Check that your feature's routes have the correct meta:

```typescript
{
  path: '/my-feature',
  meta: {
    title: 'My Feature',  // Required for sidebar
    icon: 'package',       // Optional icon
  },
}
```

---

## Creating Custom Micro-Templates

Micro-templates live in the [stacksolo-architectures](https://github.com/monkeybarrels/stacksolo-architectures) repository.

### Directory Structure

```
micro-templates/<id>/
├── template.json       # Metadata and configuration
├── README.md           # Usage documentation
└── files/
    ├── functions/      # For type: 'function'
    ├── apps/           # For type: 'ui'
    └── packages/       # For type: 'shell' or 'feature'
```

### Function Template Example

```json
{
  "id": "my-function",
  "name": "My Function",
  "type": "function",
  "description": "What this function does",
  "variables": [],
  "secrets": ["my-secret"],
  "dependencies": {
    "some-package": "^1.0.0"
  },
  "config": {
    "function": {
      "name": "my-fn",
      "runtime": "nodejs20",
      "entryPoint": "handler",
      "memory": "256Mi",
      "sourceDir": "./functions/my-fn"
    }
  }
}
```

### Feature Template Example

```json
{
  "id": "feature-module",
  "name": "Feature Module",
  "type": "feature",
  "description": "Add a feature package to an app-shell monorepo",
  "variables": [
    { "name": "name", "description": "Feature name (lowercase)", "required": true },
    { "name": "Name", "description": "Feature name (PascalCase)", "required": true },
    { "name": "org", "description": "npm org scope", "default": "myorg" }
  ],
  "feature": {
    "sourceDir": "packages/feature-template",
    "targetDir": "packages/feature-{{name}}",
    "shellUpdates": {
      "packageJson": "@{{org}}/feature-{{name}}: workspace:*",
      "routerImport": "import { routes as {{name}}Routes } from '@{{org}}/feature-{{name}}';",
      "routerSpread": "...{{name}}Routes,"
    }
  }
}
```

### Contributing

1. Fork [stacksolo-architectures](https://github.com/monkeybarrels/stacksolo-architectures)
2. Create your micro-template in `micro-templates/`
3. Add entry to `micro-templates.json`
4. Submit a pull request

---

## See Also

- [Tutorial: Build a Task Manager](/guides/building-modular-apps/) - Step-by-step guide using shell and features
- [Templates Overview](/templates/overview/) - Full project templates
- [CLI Reference](/reference/cli/) - All CLI commands
