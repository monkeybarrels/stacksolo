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

// GitHub repository configuration
const GITHUB_RAW_BASE =
  'https://raw.githubusercontent.com/monkeybarrels/stacksolo-architectures/main';

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

/**
 * Stacks index structure from stacks.json
 */
interface StacksIndex {
  version: string;
  stacks: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
    difficulty: string;
    path: string;
  }>;
}

// Simple cache for index file
let cachedIndex: { data: StacksIndex; timestamp: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Fetch the stacks index from stacks.json
 */
async function getStacksIndex(): Promise<StacksIndex> {
  if (cachedIndex && Date.now() - cachedIndex.timestamp < CACHE_TTL) {
    return cachedIndex.data;
  }

  const url = `${GITHUB_RAW_BASE}/stacks.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch stacks index: ${response.status}`);
  }

  const data = (await response.json()) as StacksIndex;
  cachedIndex = { data, timestamp: Date.now() };
  return data;
}

/**
 * Fetch full stack metadata from stack.json
 */
export async function fetchStackMetadata(
  stackId: string
): Promise<StackMetadata | null> {
  try {
    const index = await getStacksIndex();
    const stackInfo = index.stacks.find((s) => s.id === stackId);

    if (!stackInfo) {
      return null;
    }

    const url = `${GITHUB_RAW_BASE}/${stackInfo.path}/stack.json`;
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as StackMetadata;
  } catch {
    return null;
  }
}

/**
 * Fetch stack README.md
 */
export async function fetchStackReadme(stackId: string): Promise<string | null> {
  try {
    const index = await getStacksIndex();
    const stackInfo = index.stacks.find((s) => s.id === stackId);

    if (!stackInfo) {
      return null;
    }

    const url = `${GITHUB_RAW_BASE}/${stackInfo.path}/README.md`;
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Fetch all stacks from the index (with basic info)
 * For full metadata, call fetchStackMetadata for each stack
 */
export async function fetchStacksIndex(): Promise<StackMetadata[]> {
  const index = await getStacksIndex();

  // Fetch full metadata for each stack in parallel
  const metadataPromises = index.stacks.map((stack) =>
    fetchStackMetadata(stack.id)
  );
  const results = await Promise.all(metadataPromises);

  // Filter out nulls
  return results.filter((m): m is StackMetadata => m !== null);
}
