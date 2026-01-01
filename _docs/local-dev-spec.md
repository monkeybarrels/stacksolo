# StackSolo Local Dev Implementation Spec

## Context

StackSolo is an infrastructure deployment tool for solo developers. It uses a single `stacksolo.config.json` to define an application stack and handles both local development and production deployment to GCP.

**Production deployment** uses CDKTF to provision:
- Cloud Functions (Python/Node)
- Cloud Run containers
- GCP Load Balancer (handles CORS, SSL, routing)
- Firestore
- Firebase Auth
- Pub/Sub

**Local development** needs to emulate this stack without requiring GCP resources.

---

## Goal

Implement `stacksolo dev` — a command that spins up a local Kubernetes environment via OrbStack that mirrors the production GCP stack.

---

## Example Config

```json
{
  "project": {
    "name": "solo-project",
    "gcpProjectId": "refinery-platform-main",
    "region": "us-east1",
    "backend": "cdktf",
    "networks": [
      {
        "name": "main",
        "loadBalancer": {
          "name": "solo-project-lb",
          "routes": [
            { "path": "/hello/*", "backend": "hello" },
            { "path": "/api/*", "backend": "api" },
            { "path": "/*", "backend": "web" }
          ]
        },
        "functions": [
          {
            "name": "api",
            "runtime": "nodejs20",
            "entryPoint": "handler",
            "memory": "256Mi",
            "timeout": 60
          },
          {
            "name": "hello",
            "runtime": "nodejs20",
            "entryPoint": "handler",
            "memory": "256Mi",
            "timeout": 60
          }
        ],
        "uis": [
          { "name": "web", "framework": "vue" }
        ]
      }
    ]
  }
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     stacksolo dev                           │
│                    (OrbStack K8s)                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   web       │  │   hello     │  │   api               │ │
│  │   (nuxt)    │  │   (func)    │  │   (func)            │ │
│  │   :3000     │  │   :8081     │  │   :8082             │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Firestore  │  │  Firebase   │  │   Pub/Sub           │ │
│  │  Emulator   │  │  Auth Emu   │  │   Emulator          │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              Ingress (routes)                           ││
│  │   /hello/* → hello:8081                                 ││
│  │   /api/*   → api:8082                                   ││
│  │   /*       → web:3000                                   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## Components to Build

### 1. K8s Manifest Generator

**Location:** `packages/cli/src/generators/k8s/`

**Responsibility:** Read `stacksolo.config.json` and generate Kubernetes manifests.

**Mapping:**

| Config Element | K8s Resource |
|----------------|--------------|
| `functions[]` | Deployment + Service |
| `uis[]` | Deployment + Service |
| `loadBalancer.routes` | Ingress |
| Firebase (implicit) | Deployment + Service |
| Pub/Sub (implicit) | Deployment + Service |

**Output location:** `.stacksolo/k8s/*.yaml`

**Files to generate:**
- `namespace.yaml` — isolated namespace per project
- `configmap.yaml` — environment variables (emulator hosts)
- `firebase-emulator.yaml` — Firestore + Auth emulator pod
- `pubsub-emulator.yaml` — Pub/Sub emulator pod
- `function-{name}.yaml` — one per function
- `ui-{name}.yaml` — one per UI
- `ingress.yaml` — route mapping

**Key details:**

For functions:
```yaml
spec:
  containers:
    - name: api
      image: node:20-slim
      command: ["npx", "functions-framework", "--target=handler", "--port=8080"]
      volumeMounts:
        - name: source
          mountPath: /app
      workingDir: /app
  volumes:
    - name: source
      hostPath:
        path: ${absolutePathToFunctionDir}
```

For UIs (Vue/Nuxt):
```yaml
spec:
  containers:
    - name: web
      image: node:20-slim
      command: ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
      volumeMounts:
        - name: source
          mountPath: /app
      workingDir: /app
  volumes:
    - name: source
      hostPath:
        path: ${absolutePathToUiDir}
```

For Firebase emulator:
```yaml
spec:
  containers:
    - name: firebase
      image: google/firebase-emulators:latest
      ports:
        - containerPort: 8080  # Firestore
        - containerPort: 9099  # Auth
      args: ["emulators:start", "--only", "firestore,auth"]
```

For Pub/Sub emulator:
```yaml
spec:
  containers:
    - name: pubsub
      image: gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators
      command: ["gcloud", "beta", "emulators", "pubsub", "start", "--host-port=0.0.0.0:8085"]
      ports:
        - containerPort: 8085
```

---

### 2. Dev Orchestrator

**Location:** `packages/cli/src/commands/dev/`

**Files:**
- `index.ts` — main command entry
- `start.ts` — start the environment
- `stop.ts` — tear down
- `status.ts` — show running pods
- `logs.ts` — tail logs

**`stacksolo dev` flow:**

1. Check OrbStack is installed and K8s is enabled
2. Parse `stacksolo.config.json`
3. Validate source directories exist (`functions/api/`, `ui/web/`, etc.)
4. Generate K8s manifests to `.stacksolo/k8s/`
5. Run `kubectl apply -f .stacksolo/k8s/`
6. Wait for pods to be ready
7. Print access URLs (ingress or port-forward)
8. Watch for config changes → regenerate + reapply
9. Handle `Ctrl+C` → run `kubectl delete namespace ${projectName}`

**CLI interface:**

```bash
stacksolo dev              # start local environment
stacksolo dev --stop       # tear it down
stacksolo dev --logs       # tail all pod logs  
stacksolo dev --logs api   # tail specific pod
stacksolo dev --status     # show what's running
stacksolo dev --rebuild    # force regenerate manifests
```

---

### 3. Environment Variable Injection

**ConfigMap contents:**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: stacksolo-env
  namespace: ${projectName}
data:
  FIRESTORE_EMULATOR_HOST: "firebase-emulator:8080"
  FIREBASE_AUTH_EMULATOR_HOST: "firebase-emulator:9099"
  PUBSUB_EMULATOR_HOST: "pubsub-emulator:8085"
  NODE_ENV: "development"
```

All function and UI pods reference this ConfigMap via `envFrom`.

---

### 4. Project Directory Convention

```
your-project/
├── stacksolo.config.json
├── .stacksolo/                  # generated, gitignored
│   └── k8s/
│       ├── namespace.yaml
│       ├── configmap.yaml
│       ├── firebase-emulator.yaml
│       ├── pubsub-emulator.yaml
│       ├── function-api.yaml
│       ├── function-hello.yaml
│       ├── ui-web.yaml
│       └── ingress.yaml
├── functions/
│   ├── api/
│   │   ├── package.json
│   │   └── index.js            # exports.handler
│   └── hello/
│       ├── package.json
│       └── index.js
└── ui/
    └── web/
        ├── package.json
        └── nuxt.config.ts
```

**Convention:** 
- Functions live in `functions/{name}/`
- UIs live in `ui/{name}/`
- Entry point for functions matches `entryPoint` in config (default: `handler`)

---

### 5. Runtime Detection

Based on config `runtime` field:

| Runtime | Base Image | Command |
|---------|------------|---------|
| `nodejs18`, `nodejs20` | `node:20-slim` | `npx @google-cloud/functions-framework --target=${entryPoint}` |
| `python39`, `python310`, `python311`, `python312` | `python:3.12-slim` | `functions-framework --target=${entryPoint}` |

For UIs based on `framework`:

| Framework | Command |
|-----------|---------|
| `vue`, `nuxt` | `npm run dev -- --host 0.0.0.0` |
| `react`, `next` | `npm run dev -- --hostname 0.0.0.0` |
| `svelte`, `sveltekit` | `npm run dev -- --host 0.0.0.0` |

---

### 6. Port Assignment

Static port mapping to keep things predictable:

| Service | Port |
|---------|------|
| Ingress | 8000 |
| Firebase Firestore | 8080 |
| Firebase Auth | 9099 |
| Pub/Sub | 8085 |
| First function | 8081 |
| Second function | 8082 |
| ... | 808N |
| First UI | 3000 |
| Second UI | 3001 |
| ... | 300N |

---

### 7. Ingress Configuration

Map `loadBalancer.routes` to K8s Ingress:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: stacksolo-ingress
  namespace: ${projectName}
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
    - http:
        paths:
          - path: /hello(/|$)(.*)
            pathType: ImplementationSpecific
            backend:
              service:
                name: hello
                port:
                  number: 8080
          - path: /api(/|$)(.*)
            pathType: ImplementationSpecific
            backend:
              service:
                name: api
                port:
                  number: 8080
          - path: /(.*)
            pathType: ImplementationSpecific
            backend:
              service:
                name: web
                port:
                  number: 3000
```

---

## Estimated Scope

| Component | Lines | Time |
|-----------|-------|------|
| K8s manifest generator | ~300 | 1 day |
| Dev orchestrator (start/stop/status/logs) | ~200 | 0.5 day |
| Runtime/framework detection | ~100 | 0.5 day |
| Env/ConfigMap generation | ~50 | 2 hrs |
| Ingress generation | ~100 | 2 hrs |
| Testing & edge cases | — | 1 day |
| **Total** | **~750 lines** | **3-4 days** |

---

## Prerequisites for Users

1. OrbStack installed: `brew install orbstack`
2. K8s enabled in OrbStack (single checkbox in preferences)
3. `kubectl` available (OrbStack provides this)

---

## Out of Scope (Handled by CDKTF for Prod)

- Cloud Functions deployment
- Cloud Run deployment
- GCP Load Balancer + SSL certs
- Real Firestore provisioning
- Real Firebase Auth setup
- Real Pub/Sub topics/subscriptions
- IAM bindings
- VPC connectors
- Domain mapping

---

## Future Enhancements (Not MVP)

- `stacksolo dev --cloud` — connect to real GCP resources instead of emulators
- `stacksolo dev --seed` — seed Firestore emulator with test data
- `stacksolo dev --expose` — tunnel local env to public URL (like ngrok)
- Automatic `npm install` / `pip install` on first run
- Pre-built Docker images for faster cold starts
- Watch mode for `stacksolo.config.json` changes

---

## Implementation Order

1. **Manifest generator core** — namespace, configmap, basic deployment template
2. **Function manifest generation** — Node.js functions first
3. **UI manifest generation** — Vue/Nuxt first
4. **Emulator manifests** — Firebase, Pub/Sub
5. **Ingress generation** — route mapping
6. **Dev orchestrator** — `stacksolo dev` command that ties it together
7. **Stop/status/logs** — supporting commands
8. **Python runtime support** — extend function generation
9. **Other frameworks** — React, Svelte, etc.