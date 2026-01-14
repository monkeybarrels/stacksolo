---
title: Secrets Management
description: How to manage secrets in StackSolo projects
---

StackSolo provides seamless integration with GCP Secret Manager for handling sensitive configuration values like API keys, database passwords, and other credentials.

## Using Secrets in Your Config

Reference secrets in your environment variables using the `@secret/secret-name` syntax:

```json
{
  "project": {
    "networks": [{
      "name": "main",
      "functions": [{
        "name": "api",
        "env": {
          "OPENAI_API_KEY": "@secret/openai-api-key",
          "STRIPE_SECRET_KEY": "@secret/stripe-secret-key",
          "DATABASE_URL": "@secret/database-url"
        }
      }]
    }]
  }
}
```

During deployment, StackSolo:
1. Generates CDKTF code that references secrets from Secret Manager
2. Grants the function's service account `roles/secretmanager.secretAccessor`
3. Injects secrets as environment variables at runtime

## Automatic Secret Creation

When you run `stacksolo deploy`, the CLI automatically:

1. **Scans** your config for all `@secret/` references
2. **Checks** which secrets exist in GCP Secret Manager
3. **Creates** missing secrets interactively

### Using .env.production

The easiest way to manage secrets is with a `.env.production` file:

```bash
# .env.production (add to .gitignore!)
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_live_...
DATABASE_URL=postgres://user:pass@host/db
```

When deploying, StackSolo checks this file first:

```bash
$ stacksolo deploy

[1/3] Checking secrets
✓ database-url exists
✗ openai-api-key missing
✗ stripe-secret-key missing

Missing secrets:
  - openai-api-key (OPENAI_API_KEY in function:api)
  - stripe-secret-key (STRIPE_SECRET_KEY in function:api)

? Create missing secrets now? (Y/n)

Found OPENAI_API_KEY in .env.production
? Use this value? (Y/n) y
  Creating secret: openai-api-key...
  Created: openai-api-key

Found STRIPE_SECRET_KEY in .env.production
? Use this value? (Y/n) y
  Creating secret: stripe-secret-key...
  Created: stripe-secret-key

Created 2 secret(s) successfully

[2/3] Pre-flight checks
...
```

### Manual Entry

If a secret isn't in `.env.production`, you'll be prompted to enter it:

```bash
✗ api-key missing

? Enter value for API_KEY (api-key): ********
  Creating secret: api-key...
  Created: api-key
```

## Secret Naming Convention

StackSolo uses a consistent mapping between environment variable names and secret names:

| Environment Variable | Secret Name |
|---------------------|-------------|
| `OPENAI_API_KEY` | `openai-api-key` |
| `DATABASE_URL` | `database-url` |
| `STRIPE_SECRET_KEY` | `stripe-secret-key` |

The convention is:
- Lowercase
- Underscores become hyphens
- No `@secret/` prefix in the secret name

## Skipping Secret Validation

To skip the secret checking phase:

```bash
stacksolo deploy --skip-secrets
```

Note: Deployment will fail if referenced secrets don't exist in Secret Manager.

## Manual Secret Management

You can also manage secrets directly with gcloud:

```bash
# Create a secret
echo -n "your-secret-value" | gcloud secrets create secret-name --data-file=-

# List secrets
gcloud secrets list

# View a secret value
gcloud secrets versions access latest --secret=secret-name

# Update a secret
echo -n "new-value" | gcloud secrets versions add secret-name --data-file=-
```

## Best Practices

### 1. Use .env.production for Development

Keep your secrets in `.env.production` for easy local development and deployment:

```bash
# .env.production
OPENAI_API_KEY=sk-dev-key-for-development
STRIPE_SECRET_KEY=sk_test_xxx
```

### 2. Add to .gitignore

Never commit secrets to version control:

```bash
# .gitignore
.env.production
.env.local
*.env
```

### 3. Use Separate Secrets per Environment

For production vs staging, use different GCP projects with their own secrets.

### 4. Rotate Secrets Regularly

Update secrets by adding new versions:

```bash
echo -n "new-api-key" | gcloud secrets versions add openai-api-key --data-file=-
```

The new version is automatically used on the next Cloud Function deployment.

## Troubleshooting

### "Secret not found" during deployment

1. Check if the secret exists: `gcloud secrets list`
2. Verify the secret name matches the `@secret/` reference
3. Run `stacksolo deploy` (without `--skip-secrets`) to auto-create

### "Permission denied" when accessing secrets

Ensure the function's service account has the `secretAccessor` role. StackSolo grants this automatically when using `@secret/` references.

### Secrets not updating in running functions

Cloud Functions cache secrets. Redeploy to pick up new secret versions:

```bash
stacksolo deploy
```

## See Also

- [Configuration Reference](/guides/configuration/)
- [CLI Reference - deploy](/reference/cli/#stacksolo-deploy)
- [GCP Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
