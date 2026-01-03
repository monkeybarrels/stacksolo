# StackSolo.dev Website Plan

## Overview

Build an open source documentation website for StackSolo at stacksolo.dev using Astro + Firebase Hosting.

**This is 100% open source** - no pricing tiers, no sales, just community documentation.

## Tech Stack

- **Framework:** Astro + Starlight (documentation theme)
- **Hosting:** Firebase Hosting
- **Domain:** stacksolo.dev

## Site Structure

```
stacksolo.dev/
├── /                     # Landing page (what is StackSolo)
├── /docs/                # Documentation hub
│   ├── /getting-started/ # Quickstart, installation
│   ├── /guides/          # User guides
│   ├── /reference/       # API/CLI reference
│   ├── /plugins/         # Plugin documentation
│   └── /examples/        # Example configs
├── /blog/                # Updates, tutorials (future)
├── /schema/              # JSON Schema hosting
│   └── config.json       # Already created in repo
└── /playground/          # Interactive config builder (future)
```

## Implementation Tasks

### Phase 1: Foundation
- [ ] Create `website/` directory in monorepo
- [ ] Initialize Astro + Starlight project
- [ ] Add to pnpm workspace
- [ ] Set up Firebase project for hosting
- [ ] Configure firebase.json for hosting

### Phase 2: Content Migration
- [ ] Convert docs/quickstart.md
- [ ] Convert docs/configuration.md
- [ ] Convert docs/cli-reference.md
- [ ] Convert docs/architecture.md
- [ ] Convert docs/plugin-development.md
- [ ] Add plugin docs (kernel, gcp-kernel, gcp-cdktf)

### Phase 3: Landing Page
- [ ] Design hero section with value prop
- [ ] Add feature highlights
- [ ] Show code example (before/after)
- [ ] Add installation instructions

### Phase 4: Static Assets
- [ ] Copy schema/config.json to public/schema/
- [ ] Add CORS headers in firebase.json
- [ ] Add favicon, og:image, social cards

### Phase 5: Deployment
- [ ] Set up GitHub Actions for Firebase deploy
- [ ] Configure custom domain (stacksolo.dev)
- [ ] Set up www → apex redirect

### Phase 6: Enhancements (Future)
- [ ] Add search (Pagefind - works offline)
- [ ] Add interactive config playground
- [ ] Add version selector for docs
- [ ] Add changelog/releases page

## Project Structure

```
website/
├── astro.config.mjs
├── package.json
├── firebase.json
├── .firebaserc
├── public/
│   ├── favicon.svg
│   ├── og-image.png
│   └── schema/
│       └── config.json
├── src/
│   ├── content/
│   │   ├── docs/
│   │   │   ├── index.md
│   │   │   ├── getting-started/
│   │   │   │   └── quickstart.md
│   │   │   ├── guides/
│   │   │   │   ├── configuration.md
│   │   │   │   └── local-development.md
│   │   │   ├── reference/
│   │   │   │   └── cli.md
│   │   │   └── plugins/
│   │   │       ├── gcp-cdktf.md
│   │   │       ├── kernel.md
│   │   │       └── gcp-kernel.md
│   │   └── config.ts
│   └── pages/
│       └── index.astro
└── tsconfig.json
```

## Firebase Configuration

### firebase.json
```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      { "source": "**", "destination": "/index.html" }
    ],
    "headers": [
      {
        "source": "/schema/**",
        "headers": [
          { "key": "Access-Control-Allow-Origin", "value": "*" },
          { "key": "Content-Type", "value": "application/json" }
        ]
      }
    ],
    "redirects": [
      {
        "source": "/docs",
        "destination": "/docs/getting-started/quickstart",
        "type": 301
      }
    ]
  }
}
```

### .firebaserc
```json
{
  "projects": {
    "default": "stacksolo-website"
  }
}
```

## GitHub Actions Workflow

```yaml
name: Deploy Website

on:
  push:
    paths:
      - 'website/**'
      - 'docs/**'
      - 'schema/**'
    branches:
      - main
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: pnpm install

      - name: Copy schema to website
        run: cp schema/config.json website/public/schema/

      - name: Build website
        run: pnpm --filter website build

      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          channelId: live
          projectId: stacksolo-website
          entryPoint: website
```

## Landing Page Content

### Hero Section
```
Open source infrastructure for solo developers

StackSolo turns simple JSON configs into production-ready
GCP deployments. No Terraform expertise required.

[Get Started] [View on GitHub]
```

### What is StackSolo?
- Open source CLI tool
- Generates real Terraform/CDKTF code you own
- Runs locally - no SaaS, no accounts
- Plugin-based architecture

### Code Example
Show before/after:
- Config JSON → deployed infrastructure
- `stacksolo deploy` command

### Quick Install
```bash
npm install -g @stacksolo/cli
stacksolo init my-app
cd my-app
stacksolo dev
```

### Community
- GitHub: github.com/monkeybarrels/stacksolo
- Issues & discussions welcome
- Contributions encouraged

## Firebase Setup Steps

1. Create Firebase project: `stacksolo-website`
2. Enable Firebase Hosting
3. Install Firebase CLI: `npm i -g firebase-tools`
4. Login: `firebase login`
5. Init in website dir: `firebase init hosting`
6. Generate service account key for GitHub Actions
7. Add `FIREBASE_SERVICE_ACCOUNT` secret to repo

## Domain Configuration

1. In Firebase Console → Hosting → Add custom domain
2. Add stacksolo.dev
3. Verify domain ownership (TXT record)
4. Add A records to DNS
5. Wait for SSL provisioning

## Commands

```bash
# Development
cd website
pnpm dev

# Build
pnpm build

# Preview build
pnpm preview

# Deploy manually
firebase deploy --only hosting

# Deploy preview channel
firebase hosting:channel:deploy preview
```

## Dependencies

```json
{
  "dependencies": {
    "astro": "^5.0.0",
    "@astrojs/starlight": "^0.30.0"
  },
  "devDependencies": {
    "firebase-tools": "^13.0.0"
  }
}
```

## Notes

- Schema file must have CORS headers for IDE autocomplete
- Use Pagefind for search (built into Starlight)
- Astro 5 has faster builds and better DX
- Firebase free tier: 10GB storage, 360MB/day transfer
- Consider Firebase preview channels for PR previews
