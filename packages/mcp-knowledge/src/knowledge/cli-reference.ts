/**
 * CLI reference documentation for AI assistants
 */

export const cliReference = `# StackSolo CLI Reference

## Installation

\`\`\`bash
npm install -g @stacksolo/cli
\`\`\`

## Commands

### Project Commands

#### \`stacksolo init\`
Initialize a new StackSolo project.

\`\`\`bash
stacksolo init
\`\`\`

What it does:
1. Checks gcloud authentication
2. Lists your GCP projects
3. Enables required APIs
4. Asks what type of app you're building
5. Generates \`.stacksolo/stacksolo.config.json\`

#### \`stacksolo clone <source>\`
Bootstrap a new project from an existing one, sharing VPC and other resources.

\`\`\`bash
stacksolo clone ./existing-project --name new-project
stacksolo clone ./existing-project --name new-project --no-vpc  # Don't share VPC
stacksolo clone ./existing-project --name new-project -y  # Non-interactive
\`\`\`

Options:
- \`-n, --name <name>\` - Name for the new project
- \`-o, --output <dir>\` - Output directory
- \`--no-vpc\` - Don't share VPC (create new one)
- \`--no-buckets\` - Don't share storage buckets
- \`--no-registry\` - Don't share artifact registry
- \`-y, --yes\` - Skip prompts

#### \`stacksolo scaffold\`
Generate boilerplate code from your config.

\`\`\`bash
stacksolo scaffold
stacksolo scaffold --env-only  # Only generate .env files
stacksolo scaffold --docker-only  # Only generate docker-compose.yml
\`\`\`

#### \`stacksolo add <template>\`
Add template resources to an existing project without re-initializing.

\`\`\`bash
stacksolo add pdf-extractor                    # Add PDF extractor template
stacksolo add pdf-extractor --name invoice     # Add with name prefix
stacksolo add pdf-extractor --dry-run          # Preview changes
stacksolo add --list                           # List available templates
\`\`\`

Options:
- \`--name <prefix>\` - Prefix for added resource names (avoids conflicts)
- \`--dry-run\` - Preview changes without applying
- \`--list\` - List available templates
- \`-y, --yes\` - Skip confirmation prompts

What it does:
1. Loads your existing \`stacksolo.config.json\`
2. Fetches template config from remote repository
3. Merges template resources (buckets, functions, etc.) into your config
4. Copies source files to appropriate directories
5. Detects and warns about naming conflicts

### Infrastructure Commands

#### \`stacksolo deploy\`
Deploy infrastructure to GCP.

\`\`\`bash
stacksolo deploy
stacksolo deploy --preview  # Show what would change
stacksolo deploy --skip-build  # Skip container builds
stacksolo deploy --force  # Force recreate conflicting resources
stacksolo deploy --helm  # Generate Helm chart (K8s backend)
\`\`\`

Options:
- \`--preview\` - Dry run, show planned changes
- \`--skip-build\` - Skip building containers
- \`--tag <tag>\` - Container image tag (default: latest)
- \`--refresh\` - Refresh Terraform state first
- \`--force\` - Force recreate conflicting resources
- \`--helm\` - Generate Helm chart instead of raw CDKTF

#### \`stacksolo destroy\`
Destroy all deployed resources.

\`\`\`bash
stacksolo destroy
stacksolo destroy --force  # Skip confirmation
\`\`\`

#### \`stacksolo status\`
Show deployment status.

\`\`\`bash
stacksolo status
\`\`\`

#### \`stacksolo merge <projects...>\`
Merge multiple projects into a single deployable stack.

\`\`\`bash
stacksolo merge ./api ./web --name platform
stacksolo merge ./services/* --name prod --dry-run
\`\`\`

Options:
- \`--name <name>\` - Name for merged project (required)
- \`-o, --output <dir>\` - Output directory
- \`--shared-vpc <name>\` - Use shared VPC
- \`--dry-run\` - Preview without writing files

#### \`stacksolo inventory\`
Scan and manage GCP resources.

\`\`\`bash
stacksolo inventory --project=my-gcp-project
stacksolo inventory --orphaned  # Show only orphaned resources
stacksolo inventory adopt "VPC Network" my-vpc my-project
stacksolo inventory share "VPC Network" my-vpc project1 project2
\`\`\`

### Development Commands

#### \`stacksolo dev\`
Start local Kubernetes development environment.

\`\`\`bash
stacksolo dev
stacksolo dev --status  # Show running pods
stacksolo dev --logs api  # Tail logs for a service
stacksolo dev --stop  # Stop environment
stacksolo dev --rebuild  # Force regenerate K8s manifests
\`\`\`

#### \`stacksolo build\`
Build container images locally.

\`\`\`bash
stacksolo build
stacksolo build --service api  # Build specific service
stacksolo build --push  # Push to registry
\`\`\`

### Other Commands

#### \`stacksolo logs\`
View deployment logs.

\`\`\`bash
stacksolo logs
stacksolo logs --follow
stacksolo logs --since 1h
\`\`\`

#### \`stacksolo events\`
View deploy event history.

\`\`\`bash
stacksolo events  # Show latest session
stacksolo events list  # List all sessions
stacksolo events show <session-id>
\`\`\`

#### \`stacksolo output\`
Show resource outputs (URLs, connection strings, etc).

\`\`\`bash
stacksolo output
stacksolo output api  # Specific resource
\`\`\`

## Environment Variables

- \`STACKSOLO_CONFIG\` - Path to config file
- \`STACKSOLO_PROJECT\` - GCP project ID override
- \`STACKSOLO_REGION\` - Region override
- \`GOOGLE_APPLICATION_CREDENTIALS\` - Service account key path
`;

export const commonWorkflows = `# Common Workflows

## First Time Setup

\`\`\`bash
# Install CLI
npm install -g @stacksolo/cli

# Authenticate with GCP
gcloud auth login
gcloud auth application-default login

# Create project
mkdir my-app && cd my-app
stacksolo init

# Deploy
stacksolo deploy
\`\`\`

## Adding a Second App (Shared VPC)

\`\`\`bash
# Clone from existing project
mkdir my-second-app && cd my-second-app
stacksolo clone ../my-first-app --name my-second-app

# Edit config to add your resources
# Then deploy
stacksolo deploy
\`\`\`

## Local Development

\`\`\`bash
# Start local environment
stacksolo dev

# Watch logs
stacksolo dev --logs api

# Stop when done
stacksolo dev --stop
\`\`\`

## Deploy Changes

\`\`\`bash
# Preview changes first
stacksolo deploy --preview

# Deploy
stacksolo deploy

# Check status
stacksolo status
\`\`\`

## Teardown

\`\`\`bash
# Destroy all resources
stacksolo destroy

# Check for orphaned resources
stacksolo inventory --orphaned --project=my-gcp-project
\`\`\`
`;
