# GCP Permissions for StackSolo

This document tracks all GCP permissions required for deploying infrastructure with StackSolo.

## Auto-Handled by CLI

StackSolo CLI automatically detects and fixes the following permission issues:

| Issue | Auto-Fix | Manual Fallback |
|-------|----------|-----------------|
| API not enabled | `gcloud services enable <api>` | Shows console link |
| Cloud Build SA missing permissions | Grants project-level IAM roles | Shows manual commands |
| Cloud Functions SA missing permissions | Grants project-level IAM roles | Shows manual commands |
| `gcf-artifacts` repo permissions | Grants `artifactregistry.writer` on repo | Shows manual commands |
| Resource already exists (409) | Offers refresh/force delete options | Shows manual commands |
| Org policy blocks `allUsers` | Skips for Pub/Sub functions; warns for HTTP | Explains alternatives |

## Service Accounts Involved

When deploying Cloud Functions Gen2, three service accounts are involved:

| Service Account | Format | Purpose |
|-----------------|--------|---------|
| Cloud Build SA | `{PROJECT_NUMBER}@cloudbuild.gserviceaccount.com` | Builds function container images |
| Cloud Functions SA | `service-{PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com` | Manages Cloud Functions runtime |
| Compute SA | `{PROJECT_NUMBER}-compute@developer.gserviceaccount.com` | Default compute service account |

## Required Permissions

### Cloud Functions Gen2

Cloud Functions Gen2 uses Cloud Run under the hood, which requires Cloud Build to create container images. The `gcf-artifacts` repository is automatically created by GCP for function build caching.

#### Project-Level IAM Roles (Granted by CLI)

**Cloud Build Service Account** (`{PROJECT_NUMBER}@cloudbuild.gserviceaccount.com`):

| Role | Purpose |
|------|---------|
| `roles/storage.objectViewer` | Read function source from GCS |
| `roles/logging.logWriter` | Write build logs |
| `roles/artifactregistry.writer` | Push container images |

**Cloud Functions Service Account** (`service-{PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com`):

| Role | Purpose |
|------|---------|
| `roles/cloudbuild.builds.builder` | Trigger Cloud Build |
| `roles/storage.objectAdmin` | Manage function source |
| `roles/artifactregistry.reader` | Pull container images |

#### Repository-Level Permissions (gcf-artifacts)

All three service accounts need `roles/artifactregistry.writer` on the `gcf-artifacts` repository:

```bash
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)')

# Cloud Build SA
gcloud artifacts repositories add-iam-policy-binding gcf-artifacts \
  --location=us-central1 \
  --project=YOUR_PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# Cloud Functions SA
gcloud artifacts repositories add-iam-policy-binding gcf-artifacts \
  --location=us-central1 \
  --project=YOUR_PROJECT_ID \
  --member="serviceAccount:service-${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# Compute SA
gcloud artifacts repositories add-iam-policy-binding gcf-artifacts \
  --location=us-central1 \
  --project=YOUR_PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

### APIs That Must Be Enabled

The following APIs are automatically enabled by StackSolo when detected as disabled:

| API | Service Name | Required For |
|-----|--------------|--------------|
| Cloud Functions | `cloudfunctions.googleapis.com` | Cloud Functions |
| Cloud Build | `cloudbuild.googleapis.com` | Cloud Functions Gen2 builds |
| Artifact Registry | `artifactregistry.googleapis.com` | Container image storage |
| Cloud Run | `run.googleapis.com` | Cloud Functions Gen2 runtime |
| Eventarc | `eventarc.googleapis.com` | Pub/Sub triggers for functions |
| Cloud Scheduler | `cloudscheduler.googleapis.com` | Scheduled jobs |
| Pub/Sub | `pubsub.googleapis.com` | Message queues |
| Compute Engine | `compute.googleapis.com` | VPC networks |

To enable all at once:

```bash
gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  eventarc.googleapis.com \
  cloudscheduler.googleapis.com \
  pubsub.googleapis.com \
  compute.googleapis.com \
  --project=YOUR_PROJECT_ID
```

## Complete Setup Script

Run this script once per project to set up all required permissions:

```bash
#!/bin/bash
set -e

PROJECT_ID="your-project-id"
REGION="us-central1"

# Get project number
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

echo "Setting up permissions for project: $PROJECT_ID (number: $PROJECT_NUMBER)"

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  eventarc.googleapis.com \
  cloudscheduler.googleapis.com \
  pubsub.googleapis.com \
  compute.googleapis.com \
  --project=$PROJECT_ID

# Wait for gcf-artifacts to be created (happens on first function deploy)
echo "Checking if gcf-artifacts repository exists..."
if gcloud artifacts repositories describe gcf-artifacts --location=$REGION --project=$PROJECT_ID 2>/dev/null; then
  echo "gcf-artifacts exists, granting permissions..."

  # Cloud Build SA
  gcloud artifacts repositories add-iam-policy-binding gcf-artifacts \
    --location=$REGION \
    --project=$PROJECT_ID \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/artifactregistry.writer"

  # Cloud Functions SA
  gcloud artifacts repositories add-iam-policy-binding gcf-artifacts \
    --location=$REGION \
    --project=$PROJECT_ID \
    --member="serviceAccount:service-${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com" \
    --role="roles/artifactregistry.writer"

  # Compute SA
  gcloud artifacts repositories add-iam-policy-binding gcf-artifacts \
    --location=$REGION \
    --project=$PROJECT_ID \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/artifactregistry.writer"
else
  echo "gcf-artifacts does not exist yet. It will be created on first Cloud Functions deployment."
  echo "Re-run this script after your first function deployment to grant permissions."
fi

# Grant storage admin to Cloud Build SA
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

echo "Done! Permissions have been configured."
```

## Common Permission Errors

### Error: `artifactregistry.repositories.downloadArtifacts` denied on `gcf-artifacts`

**Cause:** Cloud Build cannot access the gcf-artifacts repository used for function caching.

**Solution:**
```bash
gcloud artifacts repositories add-iam-policy-binding gcf-artifacts \
  --location=us-central1 \
  --project=YOUR_PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

### Error: `API [cloudfunctions.googleapis.com] not enabled`

**Cause:** Required API is not enabled on the project.

**Solution:** StackSolo auto-enables APIs. If manual:
```bash
gcloud services enable cloudfunctions.googleapis.com --project=YOUR_PROJECT_ID
```

### Error: `Resource already exists (409)`

**Cause:** Resource exists in GCP but not in Pulumi state.

**Solution:** Delete the resource and redeploy:
```bash
gcloud functions delete FUNCTION_NAME --region=us-central1 --project=YOUR_PROJECT_ID --quiet
```

### Error: `One or more users named in the policy do not belong to a permitted customer`

**Cause:** Organization policy prevents `allUsers` from being granted invoker access. This is a security constraint set at the GCP organization level.

**Impact:** Cloud Functions cannot be made publicly accessible without authentication.

**Solution:**
- For Pub/Sub-triggered functions: No action needed - they don't require public access
- For HTTP-triggered functions: Either request an org policy exception, or use authenticated access with IAM

**Note:** StackSolo automatically skips the `allUsers` IAM binding for Pub/Sub-triggered functions since they are invoked via Eventarc, not HTTP.

### Error: `Invalid state - precondition error` when setting IAM policy

**Cause:** Pulumi attempted to set IAM policy before the function was fully initialized.

**Solution:** Simply retry the deploy - the function should be ready on the second attempt:
```bash
stacksolo deploy
```

## Notes

- IAM permission changes can take 30-60 seconds to propagate
- The `gcf-artifacts` repository is created automatically by GCP on first Cloud Functions deployment
- Cloud Functions Gen2 requires more permissions than Gen1 due to Cloud Run/Cloud Build integration
