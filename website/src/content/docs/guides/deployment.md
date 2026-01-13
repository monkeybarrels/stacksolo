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

1. **Validation** - Config is validated
2. **Code Generation** - CDKTF/Terraform code is generated
3. **Build** - Container images are built (if any)
4. **Apply** - Terraform applies the infrastructure
5. **Output** - URLs and connection strings are displayed

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

Reset and reimport:

```bash
stacksolo reset
stacksolo deploy --refresh
```

## Next Steps

- [CLI Reference](/reference/cli/) - All deploy options
- [Configuration Guide](/guides/configuration/) - Config reference
