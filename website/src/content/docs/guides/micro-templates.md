---
title: Micro-Templates
description: Mix and match single-purpose components to build your stack
---

Micro-templates are single-purpose components you can add to existing StackSolo projects. Unlike full templates that scaffold entire applications, micro-templates let you pick exactly the pieces you need.

## Quick Start

```bash
# List all available micro-templates
stacksolo add --list

# Add a micro-template to your project
stacksolo add stripe-webhook

# Add with a name prefix (avoids conflicts)
stacksolo add auth-pages --name admin
```

## Available Micro-Templates

### Functions

| ID | Description |
|----|-------------|
| `stripe-webhook` | Handle Stripe webhook events (subscriptions, payments, etc.) |
| `stripe-checkout` | Create checkout sessions and customer portal links |
| `firebase-auth-api` | Auth middleware + profile endpoint with PostgreSQL sync |
| `chat-api` | AI chat endpoint with Vertex AI streaming (SSE) |

### UIs

| ID | Description |
|----|-------------|
| `landing-page` | Marketing landing page with hero, features, pricing |
| `auth-pages` | Login and signup pages with Firebase Authentication |
| `dashboard-layout` | Sidebar + header layout for authenticated dashboards |

## How It Works

When you run `stacksolo add <micro-template-id>`:

1. **Downloads** the micro-template files from the community repository
2. **Copies** source files to your project (`functions/` or `apps/`)
3. **Merges** the config fragment into your `stacksolo.config.json`
4. **Shows** any required secrets you need to set up

## Example: Adding Stripe Payments

```bash
# Start with a basic project
stacksolo init my-saas

# Add Stripe webhook handling
stacksolo add stripe-webhook

# Add checkout session creation
stacksolo add stripe-checkout

# Set up secrets
echo "sk_live_xxx" | gcloud secrets create stripe-secret-key --data-file=-
echo "whsec_xxx" | gcloud secrets create stripe-webhook-secret --data-file=-

# Deploy
stacksolo deploy
```

## Example: Building a Dashboard

```bash
# Start with a basic project
stacksolo init my-dashboard

# Add auth pages for login/signup
stacksolo add auth-pages

# Add dashboard layout
stacksolo add dashboard-layout

# Deploy
stacksolo deploy
```

## Name Prefixes

Use `--name` to add a prefix when you need multiple instances or want to avoid conflicts:

```bash
# Add admin auth pages (creates apps/admin-auth/)
stacksolo add auth-pages --name admin

# Add user auth pages (creates apps/user-auth/)
stacksolo add auth-pages --name user
```

## Preview Changes

Use `--dry-run` to see what would be added without making changes:

```bash
stacksolo add stripe-webhook --dry-run
```

Output shows:
- Resources that will be added to config
- Files that will be copied
- Any conflicts with existing resources
- Required secrets

## Creating Your Own Micro-Templates

Micro-templates live in the [stacksolo-architectures](https://github.com/monkeybarrels/stacksolo-architectures) repository.

### Structure

```
micro-templates/<id>/
├── template.json      # Metadata and config
├── README.md          # Usage instructions
└── files/
    ├── functions/     # For function types
    │   └── <name>/
    └── apps/          # For UI types
        └── <name>/
```

### template.json

```json
{
  "id": "my-function",
  "name": "My Function",
  "type": "function",
  "description": "What it does",
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

### Contributing

1. Fork the [stacksolo-architectures](https://github.com/monkeybarrels/stacksolo-architectures) repository
2. Create your micro-template in `micro-templates/`
3. Add entry to `micro-templates.json`
4. Submit a pull request

## See Also

- [Templates Overview](/templates/overview) - Full project templates
- [CLI Reference](/reference/cli) - All CLI commands
