---
title: Installation
description: How to install StackSolo and its dependencies
---

## Requirements

StackSolo requires:

- **Node.js 18+** - For running the CLI
- **Google Cloud CLI** - For GCP authentication
- **Terraform** - For infrastructure deployment

## Install the CLI

```bash
npm install -g @stacksolo/cli
```

Verify installation:

```bash
stacksolo --version
```

## Install Dependencies

### Node.js

Download from [nodejs.org](https://nodejs.org/) or use a version manager:

```bash
# Using nvm
nvm install 20
nvm use 20

# Using Homebrew
brew install node@20
```

### Google Cloud CLI

```bash
# macOS
brew install google-cloud-sdk

# Linux
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init
```

Or download from [cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install)

### Terraform

```bash
# macOS
brew install terraform

# Linux (Ubuntu/Debian)
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform
```

Or download from [terraform.io/downloads](https://developer.hashicorp.com/terraform/downloads)

## Authenticate with GCP

```bash
# Login with your Google account
gcloud auth login

# Set up application default credentials
gcloud auth application-default login

# Set your default project
gcloud config set project YOUR_PROJECT_ID
```

## Verify Setup

Check that everything is installed:

```bash
# Check Node.js
node --version
# Should be v18.0.0 or higher

# Check gcloud
gcloud --version
# Should show Google Cloud SDK version

# Check terraform
terraform --version
# Should show Terraform version

# Check stacksolo
stacksolo --version
# Should show StackSolo version
```

## Optional: Local Development

For local development with `stacksolo dev`, you also need:

### OrbStack (macOS) or Kubernetes

```bash
# Install OrbStack (recommended for macOS)
brew install orbstack

# Or use Docker Desktop with Kubernetes enabled
# Or minikube
brew install minikube
minikube start
```

### kubectl

```bash
brew install kubectl
```

## Next Steps

- [Quickstart](/getting-started/quickstart/) - Deploy your first app
- [Configuration Guide](/guides/configuration/) - Learn the config format
