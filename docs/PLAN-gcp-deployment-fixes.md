# GCP Deployment Fixes Plan

Complete the deployment pipeline so functions, containers, and UIs deploy to GCP while maintaining local K8s dev compatibility.

**Status: Core implementation complete** - Phases 1-4 and 7 are done. Phase 5 (cross-references) and Phase 6 (scaffolder updates) are deferred.

---

## Phase 1: Fix Critical Bugs ✅ DONE

### 1.1 Fix method name mismatch in deploy service ✅
- **File:** `packages/cli/src/services/deploy.service.ts`
- **Change:** `resourceDef.generatePulumi()` → `resourceDef.generate()`

### 1.2 Fix source zip path resolution ✅
- **File:** `plugins/gcp-cdktf/src/resources/cloud-function.ts`
- **Change:** `source: './${sourceZipFileName}'` → `source: '${sourceZipFileName}'`

---

## Phase 2: Add Cloud Run Resource for Containers ✅ DONE

### 2.1 Create Cloud Run resource type ✅
- **New file:** `plugins/gcp-cdktf/src/resources/cloud-run.ts`
- **Resource ID:** `gcp-cdktf:cloud_run`
- Supports: Docker image, port, memory/CPU, env vars, VPC Connector

### 2.2 Create Artifact Registry resource ✅
- **New file:** `plugins/gcp-cdktf/src/resources/artifact-registry.ts`
- **Resource ID:** `gcp-cdktf:artifact_registry`

### 2.3 Update deploy service for containers ✅
- **File:** `packages/cli/src/services/deploy.service.ts`
- Added Docker build and push logic for containers

### 2.4 Export new resources from plugin ✅
- **File:** `plugins/gcp-cdktf/src/resources/index.ts`
- **File:** `plugins/gcp-cdktf/src/provider.ts`

---

## Phase 3: Blueprint Schema Updates ✅ DONE

### 3.1 ContainerConfig type ✅
- Already existed in `packages/blueprint/src/schema.ts`

### 3.2 Update resolver for containers ✅
- **File:** `packages/blueprint/src/resolver.ts`
- Removed error blocking containers in CDKTF mode
- Added Artifact Registry and Cloud Run resource creation
- Updated load balancer routing to support container backends

---

## Phase 4: Environment Variable Injection ✅ DONE

### 4.1 Cloud Functions env vars ✅
- Already supported via `environmentVariables` field in cloud-function.ts

### 4.2 Cloud Run env vars ✅
- Implemented in `plugins/gcp-cdktf/src/resources/cloud-run.ts`
- Standard env vars: NODE_ENV, GCP_PROJECT_ID, STACKSOLO_PROJECT_NAME, GATEWAY_URL
- Additional env vars from config

---

## Phase 5: Cross-Resource References 🔜 DEFERRED

Not implemented yet - basic deployment works without this.

---

## Phase 6: Scaffolder Updates 🔜 DEFERRED

Not implemented yet - existing scaffolds work for deployment.

---

## Phase 7: Gateway/Load Balancer for Production ✅ DONE

### 7.1 Update load balancer for Cloud Run backends ✅
- **File:** `plugins/gcp-cdktf/src/resources/load-balancer.ts`
- Added `containerName` to RouteConfig
- Added Cloud Run serverless NEG and backend generation

---

## Files Changed

### Created:
- `plugins/gcp-cdktf/src/resources/cloud-run.ts` ✅
- `plugins/gcp-cdktf/src/resources/artifact-registry.ts` ✅

### Fixed:
- `packages/cli/src/services/deploy.service.ts` ✅
- `plugins/gcp-cdktf/src/resources/cloud-function.ts` ✅

### Updated:
- `plugins/gcp-cdktf/src/resources/index.ts` ✅
- `plugins/gcp-cdktf/src/provider.ts` ✅
- `packages/blueprint/src/resolver.ts` ✅
- `plugins/gcp-cdktf/src/resources/load-balancer.ts` ✅

---

## Verification Checklist

### Local K8s Dev
- [x] `stacksolo dev` starts all pods (verified previously)
- [x] Gateway routes to functions
- [x] Gateway routes to kernel
- [x] Gateway routes to UI
- [x] Hot reload works for all services

### GCP Deployment (needs testing)
- [ ] `stacksolo deploy --dry-run` generates valid CDKTF
- [ ] Functions deploy to Cloud Functions Gen2
- [ ] Containers deploy to Cloud Run
- [ ] UIs deploy to Cloud Storage with CDN
- [ ] Load balancer routes correctly
- [ ] Environment variables injected
- [ ] VPC Connector wired (if configured)
