/**
 * Stacks Knowledge
 *
 * Documentation for available stacks - complete, deployable applications.
 */

export const stacksOverview = `# StackSolo Stacks

Stacks are **complete, deployable applications** with full source code, infrastructure config, and documentation.

## Stack vs Template vs Architecture

| Concept | What it provides | Use case |
|---------|------------------|----------|
| **Stack** | Full application (services, apps, infra) | "I want a working RAG chatbot" |
| **Template** | Scaffolded starter code | "I want a React + Firebase starter" |
| **Architecture** | Config only (no code) | "I want a config pattern for Next.js + Postgres" |

## Using Stacks

\`\`\`bash
# Clone a stack to start a new project
stacksolo clone rag-platform my-chatbot

# Or manually copy from the repo
git clone https://github.com/monkeybarrels/stacksolo-architectures
cp -r stacksolo-architectures/stacks/rag-platform my-chatbot
\`\`\`

## Stack Structure

Every stack follows this structure:

\`\`\`
my-stack/
├── stack.json              # Stack metadata and variables
├── README.md               # Documentation
├── services/               # Backend services
│   └── api/                # Express API, etc.
├── apps/                   # Frontend applications
│   └── web/                # React, Vue, etc.
└── infrastructure/         # StackSolo config
    └── config.json         # stacksolo.config.json
\`\`\`

## stack.json Schema

\`\`\`json
{
  "id": "rag-platform",
  "name": "RAG Platform",
  "description": "AI chatbot with knowledge base",
  "version": "0.4.0",
  "tags": ["ai", "chatbot", "rag"],
  "difficulty": "intermediate",
  "variables": {
    "projectName": {
      "description": "Name for your project",
      "required": true
    },
    "gcpProjectId": {
      "description": "Your GCP project ID",
      "required": true
    }
  }
}
\`\`\`
`;

// GitHub raw content URLs
const STACKS_BASE_URL =
  'https://raw.githubusercontent.com/monkeybarrels/stacksolo-architectures/main/stacks';

export interface StackMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  variables: Record<
    string,
    {
      description: string;
      required?: boolean;
      default?: string;
    }
  >;
}

// Known stacks - we fetch details from GitHub
export const knownStacks = ['rag-platform'];

export async function fetchStackMetadata(
  stackId: string
): Promise<StackMetadata | null> {
  try {
    const url = `${STACKS_BASE_URL}/${stackId}/stack.json`;
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as StackMetadata;
  } catch {
    return null;
  }
}

export async function fetchStackReadme(stackId: string): Promise<string | null> {
  try {
    const url = `${STACKS_BASE_URL}/${stackId}/README.md`;
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

export async function fetchStacksIndex(): Promise<StackMetadata[]> {
  const stacks: StackMetadata[] = [];

  for (const stackId of knownStacks) {
    const metadata = await fetchStackMetadata(stackId);
    if (metadata) {
      stacks.push(metadata);
    }
  }

  return stacks;
}
