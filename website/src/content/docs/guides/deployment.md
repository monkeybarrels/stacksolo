---
title: Deployment
description: Deploy your StackSolo project to Google Cloud
---

This guide covers deploying your StackSolo project to Google Cloud Platform.

## Quick Deploy

```bash
stacksolo deploy
```

That's it. StackSolo handles everything else.

## What Happens During Deploy

1. **Secrets Check** - Missing secrets are detected and optionally created
2. **Validation** - Config is validated
3. **Code Generation** - CDKTF/Terraform code is generated
4. **Build** - Container images are built (if any)
5. **Apply** - Terraform applies the infrastructure
6. **Output** - URLs and connection strings are displayed

## Deploy Options

### Preview Changes

See what would change without actually deploying:

```bash
stacksolo deploy --preview
```

### Skip Image Building

If you've already built and pushed images:

```bash
stacksolo deploy --skip-build
```

### Specific Image Tag

Deploy with a specific container image tag:

```bash
stacksolo deploy --tag v1.2.3
```

### Force Recreate

Force delete and recreate resources that are stuck:

```bash
stacksolo deploy --force
```

## Secrets Management

StackSolo automatically handles secrets referenced with `@secret/secret-name` in your config.

### Using .env.production

Create a `.env.production` file with your secrets:

```bash
# .env.production (add to .gitignore!)
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_live_...
DATABASE_URL=postgres://...
```

Reference them in your config:

```json
{
  "functions": [{
    "name": "api",
    "env": {
      "OPENAI_API_KEY": "@secret/openai-api-key",
      "STRIPE_SECRET_KEY": "@secret/stripe-secret-key"
    }
  }]
}
```

During deploy, StackSolo will:
1. Check which secrets exist in GCP Secret Manager
2. Offer to create missing secrets from `.env.production`
3. Prompt for any secrets not found in `.env.production`

```bash
$ stacksolo deploy

[1/4] Checking secrets
✓ database-url exists
✗ openai-api-key missing

Found OPENAI_API_KEY in .env.production
? Use this value? (Y/n)

Creating secret: openai-api-key...
✓ Created: openai-api-key
```

See the full [Secrets Management Guide](/guides/secrets/) for more details.

## Generated Code

StackSolo generates infrastructure code in `.stacksolo/`:

**CDKTF Backend (GCP):**
```
.stacksolo/
├── cdktf/
│   ├── main.ts           # Infrastructure definition
│   ├── cdktf.json        # CDKTF config
│   └── terraform/        # Generated Terraform
└── stacksolo.config.json
```

**Kubernetes Backend with Helm:**
```
.stacksolo/
├── helm-chart/
│   ├── Chart.yaml        # Chart metadata
│   ├── values.yaml       # Default values
│   └── templates/        # K8s manifests
└── stacksolo.config.json
```

You can inspect this code to see exactly what will be created.

## Helm Charts (Kubernetes)

For Kubernetes backend projects, use `--helm` to generate Helm charts:

```bash
stacksolo deploy --helm --preview
```

Helm charts enable:
- **Multi-environment deployments** via values files (`values-dev.yaml`, `values-prod.yaml`)
- **GitOps workflows** with ArgoCD or Flux
- **Rollbacks** with `helm rollback`
- **Templated configuration** with `--set` overrides

See [Helm Plugin](/plugins/helm/) for full documentation.

## Eject

If you want to manage the infrastructure yourself:

1. The generated code in `.stacksolo/cdktf/` is yours
2. You can run `cdktf deploy` directly
3. Or export to plain Terraform with `cdktf synth`

## State Management

Terraform state is stored locally in `.stacksolo/cdktf/terraform.tfstate`.

For team environments, consider configuring remote state:

```json
{
  "project": {
    "backend": "cdktf",
    "stateBackend": {
      "bucket": "my-terraform-state",
      "prefix": "stacksolo"
    }
  }
}
```

## CI/CD

### GitHub Actions Example

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install StackSolo
        run: npm install -g @stacksolo/cli

      - name: Setup GCP Auth
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Deploy
        run: stacksolo deploy
```

## Monitoring Deployment

### Check Status

```bash
stacksolo status
```

### View Outputs

```bash
stacksolo output
```

### View Logs

```bash
stacksolo logs --since 1h
```

### View Deploy Events

StackSolo logs every operation during deployment with millisecond precision. Use `stacksolo events` to view the event timeline:

```bash
# View latest deploy session
stacksolo events

# List all sessions
stacksolo events list

# Filter by category
stacksolo events show --category terraform
```

Example output:
```
+--------------+-----------------+------------+----------------------+---------------------+
| TIME         | PROJECT         | CATEGORY   | EVENT                | DETAILS             |
+--------------+-----------------+------------+----------------------+---------------------+
| 19:55:54.294 | my-app          | internal   | session_start        | deploy              |
| 19:55:54.297 | my-app          | internal   | phase_start          | phase=preflight     |
| 19:56:24.356 | my-app          | internal   | phase_end            | phase=preflight     |
| 19:56:24.358 | my-app          | internal   | phase_start          | phase=apply         |
| 19:56:24.359 | my-app          | terraform  | apply_start          |                     |
| 19:57:14.519 | my-app          | terraform  | apply_end            | exit=0              |
+--------------+-----------------+------------+----------------------+---------------------+
```

Events are stored in `~/.stacksolo/registry.db` and persisted across sessions.

## Rollback

StackSolo doesn't have built-in rollback, but you can:

1. Revert your config changes
2. Run `stacksolo deploy` again
3. Or use Terraform directly: `cd .stacksolo/cdktf && terraform apply`

## Destroy

Remove all deployed resources:

```bash
# With confirmation
stacksolo destroy

# Skip confirmation
stacksolo destroy --force
```

**Warning:** This permanently deletes all resources including databases.

## Firebase Hosting for Apps with Firebase Auth

If your app uses Firebase Authentication with social providers (Google, Apple, etc.), you should use Firebase Hosting instead of GCS buckets. This avoids cross-origin cookie issues that cause "missing initial state" errors.

### Configure Firebase Hosting

1. Set `hosting: "firebase"` in your UI config:

```json
{
  "networks": [{
    "name": "main",
    "uis": [{
      "name": "web",
      "hosting": "firebase",
      "sourceDir": "apps/web"
    }]
  }]
}
```

2. Create a `firebase.json` in your project root:

```json
{
  "hosting": {
    "public": "apps/web/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      { "source": "**", "destination": "/index.html" }
    ]
  }
}
```

3. Set `authDomain` to your Firebase Hosting domain in your app:

```env
# .env.production
VITE_FIREBASE_AUTH_DOMAIN=your-project.web.app
```

4. Deploy:

```bash
stacksolo deploy
```

StackSolo will run `firebase deploy --only hosting` after the Terraform apply completes.

### Prerequisites

- Firebase CLI installed: `npm install -g firebase-tools`
- Logged in to Firebase: `firebase login`
- Firebase project initialized: `firebase init`

### Why Firebase Hosting?

Modern browsers block third-party cookies/storage. When your app is hosted on a different domain than Firebase's `authDomain`, OAuth redirects fail with "missing initial state" errors. Firebase Hosting ensures same-origin hosting, avoiding these issues.

---

## Troubleshooting

### "Permission denied"

Make sure you're authenticated:

```bash
gcloud auth login
gcloud auth application-default login
```

### "API not enabled"

Enable required APIs:

```bash
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable compute.googleapis.com
```

### "Resource already exists"

The resource may have been created outside of StackSolo. Options:

1. Import it: `cd .stacksolo/cdktf && terraform import ...`
2. Delete it manually in GCP Console
3. Use `--force` to recreate

### State out of sync

Use the refresh command to reconcile Terraform state with GCP:

```bash
# Preview what needs to sync
stacksolo refresh --dry-run

# Apply sync (imports missing, removes orphaned)
stacksolo refresh

# Then deploy normally
stacksolo deploy
```

For a complete reset (deletes local state, requires fresh deploy):

```bash
stacksolo reset
stacksolo deploy
```

### Workspace protocol errors (pnpm monorepos)

If you see errors like `Invalid dependency version: workspace:*`, you're using pnpm workspaces. StackSolo dev containers use npm and don't understand the `workspace:*` protocol.

**Solution: Pre-build mode**

1. Configure your project for pnpm:

```json
{
  "project": {
    "packageManager": "pnpm"
  }
}
```

2. Bundle workspace dependencies at build time using `tsup` or Vite:

```typescript
// tsup.config.ts
export default defineConfig({
  noExternal: ['@your-org/shared-utils']  // Bundle workspace packages
});
```

3. Move workspace packages to `devDependencies`:

```json
{
  "devDependencies": {
    "@your-org/shared-utils": "workspace:*"
  }
}
```

4. Build before running StackSolo dev:

```bash
pnpm build
stacksolo dev
```

When StackSolo detects a `dist/` folder, it serves the pre-built artifacts without needing to resolve workspace dependencies.

### Manual deployment translation

When deploying manually with `gcloud`, translate StackSolo secret references:

| StackSolo Config | gcloud Equivalent |
|------------------|-------------------|
| `"API_KEY": "@secret/api-key"` | `--set-secrets="API_KEY=api-key:latest"` |
| `"DB_URL": "@secret/database-url"` | `--set-secrets="DB_URL=database-url:latest"` |

**Naming convention:**
- Environment variable: `SCREAMING_SNAKE_CASE` (e.g., `OPENAI_API_KEY`)
- Secret name: `kebab-case` (e.g., `openai-api-key`)

### Load balancer path routing

GCP load balancers do NOT strip path prefixes from requests. If you route `/admin/*` to a bucket backend:

| Route | File Location | URL Accessed |
|-------|--------------|--------------|
| `/admin/*` | `bucket/admin/index.html` | `https://example.com/admin/` |
| `/admin/*` | `bucket/admin/app.js` | `https://example.com/admin/app.js` |

**Important:** Files must be stored at the exact path the load balancer routes to. For example:

```bash
# For route /admin/* pointing to my-bucket
gsutil -m cp -r dist/* gs://my-bucket/admin/
```

This differs from Kubernetes nginx ingress, which strips path prefixes by default.

## Next Steps

- [CLI Reference](/reference/cli/) - All deploy options
- [Configuration Guide](/guides/configuration/) - Config reference
