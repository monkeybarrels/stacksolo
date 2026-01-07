# stacksolo

The solo developer's cloud toolkit. Deploy GCP infrastructure from the command line.

## Quick Start

```bash
# Create a new project
npx stacksolo init

# Clone a pre-built stack
npx stacksolo clone rag-platform my-chatbot

# Deploy
npx stacksolo deploy
```

## Installation

```bash
# Global install (optional)
npm install -g stacksolo

# Then use directly
stacksolo init
stacksolo deploy
```

## Documentation

Visit [stacksolo.dev](https://stacksolo.dev) for full documentation.

## What is StackSolo?

StackSolo helps solo developers deploy production-ready GCP infrastructure without the complexity of raw Terraform. Define your infrastructure in a simple JSON config, and StackSolo handles:

- VPCs, subnets, and networking
- Cloud Functions and Cloud Run containers
- Cloud SQL databases
- Load balancers with SSL
- IAP authentication
- And more...

## Commands

| Command | Description |
|---------|-------------|
| `stacksolo init` | Create a new project with GCP setup |
| `stacksolo clone <stack>` | Clone a pre-built stack |
| `stacksolo scaffold` | Generate source code from config |
| `stacksolo deploy` | Deploy infrastructure to GCP |
| `stacksolo destroy` | Tear down infrastructure |
| `stacksolo dev` | Start local development |

## License

MIT
