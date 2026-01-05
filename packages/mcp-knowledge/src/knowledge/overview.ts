/**
 * StackSolo overview content for AI assistants
 */

export const overview = `# StackSolo

StackSolo is a CLI tool that helps solo developers scaffold and deploy cloud infrastructure using CDKTF (Terraform).

## What It Does

- Takes a simple JSON config file
- Generates real CDKTF/Terraform code
- Deploys to Google Cloud Platform (GCP)
- Provides local Kubernetes development environment

## Key Concepts

### Config File
Projects are defined in \`.stacksolo/stacksolo.config.json\`. This file describes:
- Project name and GCP project ID
- Region for deployment
- Networks containing functions, containers, and UIs
- Shared resources like buckets and registries

### Resources
StackSolo manages these GCP resources:
- **Cloud Functions (Gen2)** - Serverless functions
- **Cloud Run** - Containerized services
- **Cloud SQL** - PostgreSQL/MySQL databases
- **Cloud Storage** - Object storage buckets
- **Memorystore** - Redis cache
- **Artifact Registry** - Container image registry
- **VPC Networks** - Virtual private networks
- **Load Balancers** - HTTP(S) routing
- **Pub/Sub** - Message queues
- **Cloud Scheduler** - Cron jobs
- **Secret Manager** - Secrets storage

### Networks
A network groups related resources that share a VPC. Each network can have:
- Functions (Cloud Functions)
- Containers (Cloud Run services)
- UIs (Static site hosting)
- Load balancer with route configuration

### Resource Sharing
Multiple StackSolo projects can share infrastructure:
- VPCs (important: GCP has a 5 VPC per project quota)
- Storage buckets
- Artifact registries

Use \`existing: true\` on a resource to reference one created by another project.

## Workflow

1. \`stacksolo init\` - Initialize a new project
2. Edit \`.stacksolo/stacksolo.config.json\` to define resources
3. \`stacksolo scaffold\` - Generate boilerplate code
4. Write your application code
5. \`stacksolo deploy\` - Deploy to GCP
6. \`stacksolo dev\` - Run locally with Kubernetes

## Prerequisites

- Node.js 18+
- Terraform CLI
- gcloud CLI (authenticated)
- Docker (for local dev)
`;

export const targetAudience = `## Who Is This For?

StackSolo is designed for:
- **Solo founders** bootstrapping a micro-SaaS
- **Indie hackers** who know code but not cloud infrastructure
- **Developers** who want guardrails without vendor lock-in

It's NOT designed for:
- Large teams with dedicated DevOps
- Complex multi-cloud deployments
- Users who need fine-grained infrastructure control

## Philosophy

- **You own the code** - StackSolo generates standard CDKTF/Terraform you can eject anytime
- **Opinionated defaults** - Sensible configurations for common patterns
- **Local-first** - Everything runs on your machine, no cloud dashboard needed
`;
