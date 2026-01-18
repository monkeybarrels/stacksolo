---
title: Static Site Template
description: React static site with CDN deployment
---

React static site with Vite. Deploys to Cloud Storage with CDN.

## Quick Start

```bash
# Create project
stacksolo init --template static-site

# Install dependencies
cd my-site
npm install

# Start development
npm run dev
```

## What's Included

- React + Vite setup
- TypeScript configured
- Basic routing
- Optimized production build
- CDN deployment config

## Project Structure

```
├── apps/web/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── pages/
│   ├── package.json
│   └── vite.config.ts

└── stacksolo.config.json
```

## Adding Pages

Create new pages in `src/pages/`:

```typescript
// src/pages/About.tsx
export default function About() {
  return (
    <div>
      <h1>About Us</h1>
      <p>This is the about page.</p>
    </div>
  );
}
```

Add to your router:

```typescript
// src/App.tsx
import About from './pages/About';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </Router>
  );
}
```

## Development

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

```bash
# Build first
npm run build

# Deploy to GCP
stacksolo deploy
```

This creates:
- Cloud Storage bucket for static files
- Load balancer with CDN caching
- Global anycast IP
- Optional HTTPS with managed certificate

## Adding a Custom Domain

1. Update `stacksolo.config.json`:
```json
{
  "networks": [{
    "loadBalancer": {
      "domain": "www.example.com",
      "enableHttps": true
    }
  }]
}
```

2. After deployment, configure your DNS to point to the load balancer IP

## Adding an API

To add a backend API alongside your static site:

1. Update `stacksolo.config.json`:
```json
{
  "networks": [{
    "functions": [{
      "name": "api",
      "runtime": "nodejs20",
      "entryPoint": "api"
    }],
    "uis": [{
      "name": "web",
      "framework": "react"
    }],
    "loadBalancer": {
      "routes": [
        { "path": "/api/*", "backend": "api" },
        { "path": "/*", "backend": "web" }
      ]
    }
  }]
}
```

2. Create your API in `functions/api/`
