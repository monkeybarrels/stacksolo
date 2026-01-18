---
title: AI Chat Template
description: AI chat application with Vertex AI (Gemini), streaming responses, and conversation history
---

AI chat application with Vertex AI (Gemini), streaming responses, conversation history, and Vue 3 frontend.

## Quick Start

```bash
# Create project
stacksolo init --template ai-chat

# Install dependencies
cd my-chat
npm install

# Start development
stacksolo dev
```

## What's Included

### Frontend (Vue 3)
- Firebase SDK for authentication (email/password, Google)
- Pinia store for chat state with streaming support
- Vue Router with protected routes
- Tailwind CSS styling
- Real-time streaming responses via SSE
- Conversation sidebar with history
- Markdown rendering in messages
- Auto-scrolling chat interface

### Backend
- Express API on Cloud Functions
- Vertex AI Gemini integration
- Server-Sent Events (SSE) for streaming
- Firestore for conversation history
- Message history context for multi-turn conversations

## Project Structure

```
├── apps/web/                    # Vue 3 frontend
│   └── src/
│       ├── components/
│       │   ├── ChatMessage.vue  # Message bubble with markdown
│       │   ├── ChatInput.vue    # Input with send button
│       │   └── ConversationList.vue  # Sidebar
│       ├── stores/
│       │   ├── auth.ts          # Firebase auth store
│       │   └── chat.ts          # Chat state with streaming
│       ├── pages/
│       │   ├── Chat.vue         # Main chat interface
│       │   └── Login.vue
│       ├── router/index.ts
│       └── lib/
│           ├── firebase.ts
│           └── api.ts           # SSE streaming client

├── functions/api/               # Express API
│   └── src/
│       ├── services/
│       │   ├── gemini.service.ts    # Vertex AI streaming
│       │   └── firestore.service.ts # Conversation storage
│       ├── routes/
│       │   ├── chat.ts          # SSE streaming endpoint
│       │   └── conversations.ts # History CRUD
│       └── index.ts

└── stacksolo.config.json
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/health | No | Health check |
| POST | /api/chat | Yes | Stream chat response (SSE) |
| GET | /api/conversations | Yes | List conversations |
| GET | /api/conversations/:id | Yes | Get conversation with messages |
| DELETE | /api/conversations/:id | Yes | Delete conversation |

## Streaming Architecture

The chat uses Server-Sent Events (SSE) for real-time streaming:

### Backend (chat.ts)

```typescript
router.post('/chat', kernel.authMiddleware(), async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  for await (const chunk of geminiService.streamChat(messages)) {
    res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
  }

  res.write(`data: ${JSON.stringify({ type: 'done', conversationId })}\n\n`);
  res.end();
});
```

### Frontend (api.ts)

```typescript
export async function* streamChat(message: string, conversationId?: string) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversationId }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const lines = decoder.decode(value).split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        yield JSON.parse(line.slice(6));
      }
    }
  }
}
```

## Customization

### Change Model

Update `services/gemini.service.ts`:

```typescript
const model = vertexAI.getGenerativeModel({
  model: 'gemini-1.5-pro',  // or gemini-1.5-flash for faster responses
});
```

### Add System Prompt

```typescript
const chat = model.startChat({
  history,
  systemInstruction: {
    role: 'system',
    parts: [{ text: 'You are a helpful assistant specialized in...' }],
  },
});
```

### Add RAG (Retrieval)

1. Add vector store (pgvector or Vertex AI Vector Search)
2. Before sending to Gemini, retrieve relevant documents
3. Include context in the system prompt

## Environment Variables

For local development, create `.env.local`:

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
```

## Deployment

```bash
stacksolo deploy
```

This creates:
- Cloud Functions API with Vertex AI access
- Firestore database for conversations
- Cloud Storage for frontend
- Load balancer with SSL
