# Quickstart Guide

Get your first app deployed in 5 minutes.

## Prerequisites

Before you start, install these tools:

1. **Node.js 18+**
   ```bash
   # Check your version
   node --version
   ```

2. **Google Cloud CLI**
   ```bash
   # macOS
   brew install google-cloud-sdk

   # Or download from: https://cloud.google.com/sdk/docs/install
   ```

3. **Terraform**
   ```bash
   # macOS
   brew install terraform

   # Or download from: https://developer.hashicorp.com/terraform/downloads
   ```

## Step 1: Install StackSolo

```bash
npm install -g @stacksolo/cli
```

Verify the installation:
```bash
stacksolo --version
```

## Step 2: Login to Google Cloud

```bash
gcloud auth login
gcloud auth application-default login
```

## Step 3: Initialize a Project

Create a new directory and initialize StackSolo:

```bash
mkdir my-app
cd my-app
stacksolo init
```

The init command will:
1. Ask you to select a GCP project
2. Enable required APIs
3. Ask what type of app you're building
4. Generate a config file

## Step 4: Look at Your Config

After init, you'll have a `.stacksolo/stacksolo.config.json` file:

```json
{
  "project": {
    "name": "my-app",
    "gcpProjectId": "your-gcp-project",
    "region": "us-central1",
    "backend": "cdktf",

    "networks": [{
      "name": "main",
      "functions": [{
        "name": "api",
        "runtime": "nodejs20",
        "entryPoint": "api",
        "allowUnauthenticated": true
      }],
      "loadBalancer": {
        "name": "gateway",
        "routes": [
          { "path": "/*", "functionName": "api" }
        ]
      }
    }]
  }
}
```

## Step 5: Create Your Function

Create a simple API function:

```bash
mkdir -p functions/api
```

Create `functions/api/package.json`:
```json
{
  "name": "api",
  "main": "index.js",
  "dependencies": {
    "@google-cloud/functions-framework": "^3.0.0"
  }
}
```

Create `functions/api/index.js`:
```javascript
const functions = require('@google-cloud/functions-framework');

functions.http('api', (req, res) => {
  res.json({ message: 'Hello from StackSolo!' });
});
```

## Step 6: Deploy

```bash
stacksolo deploy
```

StackSolo will:
1. Generate CDKTF/Terraform code
2. Create a Cloud Storage bucket for your function code
3. Deploy your Cloud Function
4. Create a load balancer
5. Output the URL

## Step 7: Test Your API

```bash
curl http://<your-load-balancer-ip>/
# {"message":"Hello from StackSolo!"}
```

## What Just Happened?

StackSolo created these GCP resources:
- A Cloud Storage bucket (for function source code)
- A Cloud Function (Gen2)
- A serverless NEG (Network Endpoint Group)
- A backend service
- A URL map
- An HTTP proxy
- A global IP address
- A forwarding rule

All from a 20-line config file.

## Next Steps

- [Add a frontend](./configuration.md#static-websites) to your app
- [Add a database](./configuration.md#databases) for persistence
- [Use environment variables](./configuration.md#environment-variables) and secrets
- [Read the full CLI reference](./cli-reference.md)

## Common Commands

```bash
# See what would be deployed (dry run)
stacksolo deploy --preview

# Check deployment status
stacksolo status

# View logs
stacksolo logs

# Destroy all resources
stacksolo destroy
```

## Troubleshooting

### "Permission denied" errors

Make sure you're authenticated:
```bash
gcloud auth login
gcloud auth application-default login
```

### "API not enabled" errors

StackSolo tries to enable APIs automatically. If it fails, enable them manually:
```bash
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
```

### "Terraform not found"

Install Terraform:
```bash
brew install terraform
```