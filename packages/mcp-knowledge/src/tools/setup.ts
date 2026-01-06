/**
 * Setup Tool
 *
 * Provides installation and setup instructions.
 */

import type { Tool } from './types';
import { registry } from '@stacksolo/core';

export const setupTool: Tool = {
  definition: {
    name: 'stacksolo_setup',
    description:
      'Get installation and setup instructions for StackSolo CLI and plugins. Includes prerequisites, installation steps, and configuration.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  handler: async () => {
    let output = '# StackSolo Setup Guide\n\n';

    output += '## Prerequisites\n\n';
    output += 'Before installing StackSolo, ensure you have:\n\n';
    output += '1. **Node.js 18+** - [Download](https://nodejs.org/)\n';
    output +=
      '2. **Google Cloud SDK (gcloud)** - [Install Guide](https://cloud.google.com/sdk/docs/install)\n';
    output +=
      '3. **Terraform CLI** - [Install Guide](https://developer.hashicorp.com/terraform/downloads)\n';
    output += '4. **A GCP Project** with billing enabled\n\n';

    output += '## Step 1: Authenticate with GCP\n\n';
    output += '```bash\n';
    output += '# Login to Google Cloud\n';
    output += 'gcloud auth login\n\n';
    output += '# Set your default project\n';
    output += 'gcloud config set project YOUR_PROJECT_ID\n\n';
    output += '# Enable application default credentials (for Terraform)\n';
    output += 'gcloud auth application-default login\n';
    output += '```\n\n';

    output += '## Step 2: Install StackSolo CLI\n\n';
    output += '```bash\n';
    output += '# Install globally\n';
    output += 'npm install -g @stacksolo/cli\n\n';
    output += '# Or use npx (no install needed)\n';
    output += 'npx @stacksolo/cli --help\n';
    output += '```\n\n';

    output += '## Step 3: Initialize a Project\n\n';
    output += '```bash\n';
    output += '# Create a new StackSolo project\n';
    output += 'stacksolo init\n\n';
    output += '# Or initialize in an existing directory\n';
    output += 'cd my-project\n';
    output += 'stacksolo init\n';
    output += '```\n\n';
    output += 'This creates a `.stacksolo/stacksolo.config.json` file.\n\n';

    output += '## Step 4: Configure Your Infrastructure\n\n';
    output += 'Edit `.stacksolo/stacksolo.config.json` to define your infrastructure:\n\n';
    output += '```json\n';
    output += '{\n';
    output += '  "project": {\n';
    output += '    "name": "my-app",\n';
    output += '    "gcpProjectId": "YOUR_GCP_PROJECT_ID",\n';
    output += '    "region": "us-central1",\n';
    output += '    "networks": [\n';
    output += '      {\n';
    output += '        "name": "main",\n';
    output += '        "containers": [\n';
    output += '          {\n';
    output += '            "name": "api",\n';
    output += '            "port": 8080,\n';
    output += '            "allowUnauthenticated": true\n';
    output += '          }\n';
    output += '        ]\n';
    output += '      }\n';
    output += '    ]\n';
    output += '  }\n';
    output += '}\n';
    output += '```\n\n';

    output += '## Step 5: Generate Scaffolding\n\n';
    output += '```bash\n';
    output += '# Generate boilerplate code for your resources\n';
    output += 'stacksolo scaffold\n';
    output += '```\n\n';
    output += 'This creates starter code for containers, functions, and UIs.\n\n';

    output += '## Step 6: Deploy\n\n';
    output += '```bash\n';
    output += '# Deploy your infrastructure\n';
    output += 'stacksolo deploy\n';
    output += '```\n\n';

    output += '---\n\n';

    output += '## Available Plugins\n\n';
    output += 'StackSolo uses plugins to support different cloud providers and output formats.\n\n';

    // Get plugins from registry
    const providers = registry.getAllProviders();

    output += '### Currently Installed Plugins\n\n';

    if (providers.length === 0) {
      output += 'No plugins currently registered.\n\n';
    } else {
      for (const provider of providers) {
        output += `#### ${provider.name} (\`${provider.id}\`)\n\n`;
        output += `- **Authentication:** ${provider.auth.type}\n`;
        output += `- **Resources:** ${provider.resources.length} available\n`;
        output += `- **Auth Instructions:** ${provider.auth.instructions}\n\n`;

        output += '**Available Resources:**\n';
        for (const resource of provider.resources) {
          output += `- \`${resource.id}\` - ${resource.name}\n`;
        }
        output += '\n';
      }
    }

    output += '### Available Plugins on npm\n\n';
    output += 'Select the plugins you want to install based on your deployment target:\n\n';

    output += '---\n\n';

    output += '#### 1. `@stacksolo/plugin-gcp-cdktf` - Google Cloud Platform\n\n';
    output += '**Description:** Deploy to GCP using CDKTF (Terraform CDK)\n\n';
    output += '**npm:** https://www.npmjs.com/package/@stacksolo/plugin-gcp-cdktf\n\n';
    output +=
      '**GitHub:** https://github.com/monkeybarrels/stacksolo/tree/main/plugins/gcp-cdktf\n\n';
    output += '**Supported Resources:**\n';
    output += '- Cloud Run (containers)\n';
    output += '- Cloud Functions (serverless)\n';
    output += '- Cloud SQL (PostgreSQL/MySQL)\n';
    output += '- Memorystore Redis\n';
    output += '- Cloud Storage\n';
    output += '- Load Balancer with SSL\n';
    output += '- VPC Networks\n';
    output += '- Artifact Registry\n\n';

    output += '**Installation:**\n';
    output += '```bash\n';
    output += 'npm install @stacksolo/plugin-gcp-cdktf\n';
    output += '```\n\n';

    output += '---\n\n';

    output += '#### 2. `@stacksolo/plugin-gcp-kernel` - GCP Native Kernel\n\n';
    output +=
      '**Description:** GCP-native kernel for Firebase Auth validation, file storage, and events\n\n';
    output += '**npm:** https://www.npmjs.com/package/@stacksolo/plugin-gcp-kernel\n\n';
    output +=
      '**GitHub:** https://github.com/monkeybarrels/stacksolo/tree/main/plugins/gcp-kernel\n\n';
    output += '**Features:**\n';
    output += '- Firebase Auth token validation\n';
    output += '- Cloud Storage signed URL generation\n';
    output += '- Cloud Pub/Sub event publishing\n';
    output += '- Scales to zero (pay-per-use)\n\n';

    output += '**Installation:**\n';
    output += '```bash\n';
    output += 'npm install @stacksolo/plugin-gcp-kernel\n';
    output += '```\n\n';

    output += '---\n\n';

    output += '#### 3. `@stacksolo/plugin-helm` - Helm Chart Generator\n\n';
    output += '**Description:** Generates Helm charts from StackSolo Kubernetes manifests\n\n';
    output += '**npm:** https://www.npmjs.com/package/@stacksolo/plugin-helm\n\n';
    output += '**GitHub:** https://github.com/monkeybarrels/stacksolo/tree/main/plugins/helm\n\n';
    output += '**Features:**\n';
    output += '- Converts K8s manifests to Helm charts\n';
    output += '- Generates values.yaml with customizable parameters\n';
    output += '- Creates Chart.yaml with metadata\n\n';

    output += '**Installation:**\n';
    output += '```bash\n';
    output += 'npm install @stacksolo/plugin-helm\n';
    output += '```\n\n';

    output += '---\n\n';

    output += '### Quick Install Commands\n\n';
    output += '```bash\n';
    output += '# Core GCP deployment\n';
    output += 'npm install @stacksolo/plugin-gcp-cdktf\n\n';
    output += '# Add Firebase Auth support\n';
    output += 'npm install @stacksolo/plugin-gcp-kernel\n\n';
    output += '# Add Helm chart generation\n';
    output += 'npm install @stacksolo/plugin-helm\n';
    output += '```\n\n';

    output += '---\n\n';

    output += '## Troubleshooting\n\n';
    output += '**"Permission denied" errors (GCP):**\n';
    output += '- Ensure your account has Owner or Editor role on the GCP project\n';
    output += '- Re-run `gcloud auth application-default login`\n\n';
    output += '**"API not enabled" errors (GCP):**\n';
    output += '- Enable the required API using `gcloud services enable API_NAME`\n\n';
    output += '**Terraform state issues (GCP):**\n';
    output += '- State is stored in `.stacksolo/terraform/`\n';
    output += '- Run `stacksolo destroy` before deleting the project to clean up resources\n';

    return {
      content: [{ type: 'text', text: output }],
    };
  },
};
