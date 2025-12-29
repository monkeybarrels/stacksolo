<script lang="ts">
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc/client';

  // Simple form for manual resource-based projects (no app pattern)
  let name = '';
  let provider = 'gcp';
  let projectId = '';
  let region = 'us-central1';
  let loading = false;
  let error: string | null = null;

  const regions = [
    'us-central1',
    'us-east1',
    'us-west1',
    'europe-west1',
    'asia-east1',
  ];

  async function handleSubmit() {
    if (!name.trim()) {
      error = 'Project name is required';
      return;
    }
    if (!projectId.trim()) {
      error = 'GCP Project ID is required';
      return;
    }

    loading = true;
    error = null;

    try {
      const project = await trpc.projects.create.mutate({
        name: name.trim(),
        provider,
        providerConfig: {
          projectId: projectId.trim(),
          region,
        },
      });
      goto(`/projects/${project.id}`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create project';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>New Project - StackSolo</title>
</svelte:head>

<div class="container">
  <div class="page-header">
    <h1 class="page-title">Create New Project</h1>
  </div>

  <!-- CLI recommendation for app patterns -->
  <div class="card cli-info">
    <h2 class="section-title">Deploying an App?</h2>
    <p class="section-description">
      For Next.js, SvelteKit, or other app deployments, use the CLI in your project folder:
    </p>
    <pre class="cli-command"><code><span class="comment"># One-time setup (from stacksolo repo):</span>
pnpm cli:link

<span class="comment"># Then in your app folder:</span>
cd your-project
stacksolo init</code></pre>
    <p class="cli-benefits">
      The CLI will detect your app type, configure infrastructure, and register your project automatically.
    </p>
  </div>

  <div class="divider">
    <span>or create a manual resource project</span>
  </div>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  <!-- Simple form for manual projects -->
  <form class="card form" on:submit|preventDefault={handleSubmit}>
    <h2 class="section-title">Manual Project</h2>
    <p class="section-description">
      Create a project to manually add individual cloud resources (buckets, databases, etc.)
    </p>

    <div class="form-group">
      <label class="form-label" for="name">Project Name</label>
      <input
        type="text"
        id="name"
        class="form-input"
        bind:value={name}
        placeholder="My Infrastructure Project"
      />
    </div>

    <div class="form-group">
      <label class="form-label" for="provider">Cloud Provider</label>
      <select id="provider" class="form-select" bind:value={provider}>
        <option value="gcp">Google Cloud Platform</option>
      </select>
      <p class="form-help">More providers coming soon</p>
    </div>

    <div class="form-group">
      <label class="form-label" for="projectId">GCP Project ID</label>
      <input
        type="text"
        id="projectId"
        class="form-input"
        bind:value={projectId}
        placeholder="my-gcp-project-123"
      />
      <p class="form-help">Your Google Cloud project ID</p>
    </div>

    <div class="form-group">
      <label class="form-label" for="region">Region</label>
      <select id="region" class="form-select" bind:value={region}>
        {#each regions as r}
          <option value={r}>{r}</option>
        {/each}
      </select>
    </div>

    <div class="form-actions">
      <a href="/projects" class="btn btn-secondary">Cancel</a>
      <button type="submit" class="btn btn-primary" disabled={loading}>
        {loading ? 'Creating...' : 'Create Project'}
      </button>
    </div>
  </form>
</div>

<style>
  .form {
    max-width: 600px;
  }

  .section-title {
    font-size: 1.25rem;
    margin-bottom: 0.5rem;
  }

  .section-description {
    color: var(--color-text-secondary);
    margin-bottom: 1.5rem;
  }

  .form-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    margin-top: 1.5rem;
  }

  .error-message {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid var(--color-error);
    border-radius: var(--radius);
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    color: var(--color-error);
    font-size: 0.875rem;
    max-width: 600px;
  }

  .cli-info {
    max-width: 600px;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(99, 102, 241, 0.05));
    border: 1px solid var(--color-primary);
  }

  .cli-command {
    background: var(--color-bg-secondary, #1a1a2e);
    color: var(--color-text, #e0e0e0);
    padding: 1rem;
    border-radius: var(--radius);
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.875rem;
    overflow-x: auto;
    margin: 1rem 0;
  }

  .cli-command code {
    color: #a5d6ff;
  }

  .cli-command .comment {
    color: #6a737d;
  }

  .cli-benefits {
    color: var(--color-text-secondary);
    font-size: 0.875rem;
    margin: 0;
  }

  .divider {
    display: flex;
    align-items: center;
    max-width: 600px;
    margin: 2rem 0;
    color: var(--color-text-tertiary);
    font-size: 0.875rem;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-border);
  }

  .divider span {
    padding: 0 1rem;
  }
</style>
