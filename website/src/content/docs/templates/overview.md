---
title: Templates
description: Complete, production-ready app templates for common use cases
---

Templates provide complete, working application code that you can customize. Unlike architectures (config-only), templates include full source code for both frontend and backend.

## What's Included in Templates

Every template includes:
- **Frontend code** (Vue 3 with Tailwind CSS)
- **Backend code** (Express API on Cloud Functions)
- **Database schemas** and migrations (Drizzle ORM)
- **Authentication setup** (Firebase Auth)
- **Ready-to-deploy configuration** (stacksolo.config.json)

## Using Templates

```bash
# List available templates
stacksolo init --list-templates

# Create project from template
stacksolo init --template <template-name>

# Example: Create a SaaS app
stacksolo init --template saas-starter
```

When prompted, you'll configure:
- Project name
- GCP Project ID
- Region

## Available Templates

| Template | Description | Difficulty |
|----------|-------------|------------|
| [**saas-starter**](/templates/saas-starter/) | Complete SaaS foundation with Firebase Auth, Stripe billing, and Vue 3 | Intermediate |
| [**ai-chat**](/templates/ai-chat/) | AI chat application with Vertex AI (Gemini), streaming responses | Intermediate |
| [**api-gateway**](/templates/api-gateway/) | API monetization with key management, rate limiting (Redis), usage tracking | Advanced |
| [**ecommerce**](/templates/ecommerce/) | E-commerce store with Stripe products, cart, checkout, orders | Intermediate |
| [**firebase-app**](/templates/firebase-app/) | Full-stack app with Firebase Auth and Firestore | Beginner |
| [**firebase-postgres**](/templates/firebase-postgres/) | Firebase Auth + PostgreSQL with Drizzle ORM | Intermediate |
| [**api-starter**](/templates/api-starter/) | Simple Express API ready to extend | Beginner |
| [**static-site**](/templates/static-site/) | React static site with CDN deployment | Beginner |

## Template vs Architecture vs Stack vs Shell

| Concept | What it provides | When to use |
|---------|------------------|-------------|
| **Template** | Full source code + config | Starting a new project from scratch |
| **Shell** | Modular monorepo foundation | Building large apps with feature packages |
| **Architecture** | Config only (no code) | Adding infrastructure to existing code |
| **Stack** | Template + Architecture + Documentation | Complete applications you can customize |

## Modular Apps (Shell + Features)

For larger applications, use the shell template to create a modular monorepo:

```bash
# Create modular app foundation
stacksolo init --template app-shell --name myorg

# Add feature packages
cd my-app
stacksolo add feature-module --name inventory
stacksolo add feature-module --name reports
```

This creates a pnpm monorepo with:
- **packages/shell/** - Core Vue 3 app with Firebase Auth
- **packages/shared/** - Shared components and stores
- **packages/feature-*/*** - Feature packages with independent routing

**See also:** [Micro-Templates Guide](/guides/micro-templates/)

## After Creating from Template

```bash
# Install dependencies
npm install

# Start local development
stacksolo dev

# Deploy to GCP
stacksolo deploy
```

## Customizing Templates

Templates are yours to modify. Common customizations:

1. **Add new pages** - Create Vue components in `apps/web/src/pages/`
2. **Add API routes** - Create routes in `functions/api/src/routes/`
3. **Add database tables** - Update `functions/api/src/db/schema.ts`
4. **Change styling** - Modify Tailwind config or component styles

## Tech Stack

All templates use a consistent tech stack:

| Layer | Technology |
|-------|------------|
| Frontend | Vue 3 + Vite + Tailwind CSS + Pinia |
| Backend | Express on Cloud Functions |
| Database | PostgreSQL with Drizzle ORM (or Firestore) |
| Auth | Firebase Authentication |
| Payments | Stripe (when applicable) |
| Infrastructure | StackSolo (CDKTF/Terraform) |
