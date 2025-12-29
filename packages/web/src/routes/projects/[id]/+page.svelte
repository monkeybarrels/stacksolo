<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { trpc } from '$lib/trpc/client';

  interface Project {
    id: string;
    name: string;
    provider: string;
    providerConfig: { projectId?: string; region?: string };
  }

  interface Resource {
    id: string;
    name: string;
    type: string;
    config: Record<string, unknown>;
  }

  interface GeneratedFile {
    path: string;
    content: string;
  }

  interface Deployment {
    id: string;
    status: 'pending' | 'running' | 'succeeded' | 'failed';
    startedAt: string;
    logs: string | null;
    error: string | null;
  }

  let project: Project | null = null;
  let resources: Resource[] = [];
  let generatedCode: GeneratedFile[] = [];
  let deployments: Deployment[] = [];
  let loading = true;
  let error: string | null = null;
  let activeTab: 'resources' | 'code' | 'deployments' = 'resources';
  let destroying = false;
  let liveLogs: string[] = [];
  let activeDeploymentId: string | null = null;

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

  // Add resource form
  let showAddForm = false;
  let newResourceName = '';
  let newResourceType = 'gcp:storage_bucket';
  let newResourceConfig: Record<string, unknown> = {};
  let resourceTypes: any[] = [];
  let selectedResourceSchema: any = null;

  $: projectId = $page.params.id;

  onMount(async () => {
    await loadProject();
    await loadResourceTypes();
  });

  async function loadProject() {
    try {
      [project, resources, deployments] = await Promise.all([
        trpc.projects.get.query({ id: projectId }),
        trpc.resources.listByProject.query({ projectId }),
        trpc.deployments.listByProject.query({ projectId }),
      ]);

      if (resources.length > 0) {
        await loadGeneratedCode();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load project';
    } finally {
      loading = false;
    }
  }

  async function loadResourceTypes() {
    try {
      const provider = await trpc.providers.get.query({ id: 'gcp' });
      resourceTypes = provider.resources;
      if (resourceTypes.length > 0) {
        await selectResourceType(resourceTypes[0].id);
      }
    } catch (err) {
      console.error('Failed to load resource types:', err);
    }
  }

  async function selectResourceType(typeId: string) {
    newResourceType = typeId;
    const resourceType = await trpc.providers.getResourceType.query({ id: typeId });
    selectedResourceSchema = resourceType.configSchema;
    newResourceConfig = { ...resourceType.defaultConfig };
  }

  async function loadGeneratedCode() {
    try {
      generatedCode = await trpc.deployments.getCode.query({ projectId });
    } catch (err) {
      console.error('Failed to load generated code:', err);
    }
  }

  async function addResource() {
    if (!newResourceName.trim()) return;

    try {
      const resource = await trpc.resources.create.mutate({
        projectId,
        type: newResourceType,
        name: newResourceName.trim(),
        config: newResourceConfig,
      });
      resources = [...resources, resource];
      showAddForm = false;
      newResourceName = '';
      newResourceConfig = {};
      await loadGeneratedCode();
    } catch (err) {
      alert('Failed to add resource');
    }
  }

  async function deleteResource(id: string) {
    if (!confirm('Delete this resource?')) return;

    try {
      await trpc.resources.delete.mutate({ id });
      resources = resources.filter(r => r.id !== id);
      await loadGeneratedCode();
    } catch (err) {
      alert('Failed to delete resource');
    }
  }

  async function deploy() {
    try {
      const deployment = await trpc.deployments.deploy.mutate({ projectId });
      deployments = [deployment, ...deployments];
      activeTab = 'deployments';
      liveLogs = [];
      activeDeploymentId = deployment.id;
      streamDeploymentLogs(deployment.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Deploy failed');
    }
  }

  function streamDeploymentLogs(id: string) {
    const eventSource = new EventSource(`${API_URL}/deployments/${id}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'log') {
          liveLogs = [...liveLogs, data.message];
        } else if (data.type === 'status') {
          deployments = deployments.map(d =>
            d.id === id ? { ...d, status: data.message } : d
          );
        } else if (data.type === 'error') {
          liveLogs = [...liveLogs, `ERROR: ${data.message}`];
        } else if (data.type === 'complete') {
          // Fetch final deployment state
          trpc.deployments.get.query({ id }).then(updated => {
            deployments = deployments.map(d => d.id === id ? updated : d);
            activeDeploymentId = null;
          });
          eventSource.close();
        }
      } catch (e) {
        console.error('Failed to parse SSE event:', e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      activeDeploymentId = null;
      // Fallback: fetch final state
      trpc.deployments.get.query({ id }).then(updated => {
        deployments = deployments.map(d => d.id === id ? updated : d);
      });
    };
  }

  function getStatusBadgeClass(status: string) {
    const classes: Record<string, string> = {
      pending: 'badge-pending',
      running: 'badge-warning',
      succeeded: 'badge-success',
      failed: 'badge-error',
    };
    return classes[status] || 'badge-pending';
  }

  function hasSuccessfulDeployment(): boolean {
    return deployments.some(d => d.status === 'succeeded');
  }

  async function destroy() {
    if (!confirm('Are you sure you want to destroy all deployed resources? This cannot be undone.')) {
      return;
    }

    destroying = true;
    try {
      await trpc.deployments.destroy.mutate({ projectId });
      alert('Resources destroyed successfully');
      // Reload deployments to reflect the change
      deployments = await trpc.deployments.listByProject.query({ projectId });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Destroy failed');
    } finally {
      destroying = false;
    }
  }
</script>

<svelte:head>
  <title>{project?.name || 'Project'} - StackSolo</title>
</svelte:head>

<div class="container">
  {#if loading}
    <div class="empty-state">Loading...</div>
  {:else if error}
    <div class="empty-state">
      <p style="color: var(--color-error)">{error}</p>
      <a href="/projects" class="btn btn-secondary" style="margin-top: 1rem">Back to Projects</a>
    </div>
  {:else if project}
    <div class="page-header">
      <div>
        <h1 class="page-title">{project.name}</h1>
        <div class="project-meta">
          <span class="badge badge-pending">{project.provider.toUpperCase()}</span>
          {#if project.providerConfig.projectId}
            <span>{project.providerConfig.projectId}</span>
          {/if}
        </div>
      </div>
      <div class="header-actions">
        {#if hasSuccessfulDeployment()}
          <button
            class="btn btn-danger"
            on:click={destroy}
            disabled={destroying}
          >
            {destroying ? 'Destroying...' : '💥 Destroy'}
          </button>
        {/if}
        <button
          class="btn btn-primary"
          on:click={deploy}
          disabled={resources.length === 0}
        >
          🚀 Deploy
        </button>
      </div>
    </div>

    <div class="tabs">
      <button
        class="tab"
        class:active={activeTab === 'resources'}
        on:click={() => activeTab = 'resources'}
      >
        Resources ({resources.length})
      </button>
      <button
        class="tab"
        class:active={activeTab === 'code'}
        on:click={() => activeTab = 'code'}
      >
        Generated Code
      </button>
      <button
        class="tab"
        class:active={activeTab === 'deployments'}
        on:click={() => activeTab = 'deployments'}
      >
        Deployments ({deployments.length})
      </button>
    </div>

    <div class="tab-content">
      {#if activeTab === 'resources'}
        <div class="section-header">
          <h2>Resources</h2>
          <button class="btn btn-secondary" on:click={() => showAddForm = !showAddForm}>
            {showAddForm ? 'Cancel' : '+ Add Resource'}
          </button>
        </div>

        {#if showAddForm}
          <div class="card add-form">
            <div class="form-group">
              <label class="form-label">Resource Type</label>
              <select
                class="form-select"
                bind:value={newResourceType}
                on:change={() => selectResourceType(newResourceType)}
              >
                {#each resourceTypes as rt}
                  <option value={rt.id}>{rt.name}</option>
                {/each}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Resource Name</label>
              <input
                type="text"
                class="form-input"
                bind:value={newResourceName}
                placeholder="my-bucket"
              />
            </div>

            {#if selectedResourceSchema?.properties}
              {#each Object.entries(selectedResourceSchema.properties) as [key, prop]}
                {#if key !== 'name'}
                  <div class="form-group">
                    <label class="form-label">{prop.title || key}</label>
                    {#if prop.enum}
                      <select class="form-select" bind:value={newResourceConfig[key]}>
                        {#each prop.enum as opt}
                          <option value={opt}>{opt}</option>
                        {/each}
                      </select>
                    {:else if prop.type === 'boolean'}
                      <label class="checkbox-label">
                        <input
                          type="checkbox"
                          bind:checked={newResourceConfig[key]}
                        />
                        {prop.description || ''}
                      </label>
                    {:else}
                      <input
                        type="text"
                        class="form-input"
                        bind:value={newResourceConfig[key]}
                        placeholder={prop.default?.toString() || ''}
                      />
                    {/if}
                    {#if prop.description && prop.type !== 'boolean'}
                      <p class="form-help">{prop.description}</p>
                    {/if}
                  </div>
                {/if}
              {/each}
            {/if}

            <button class="btn btn-primary" on:click={addResource}>Add Resource</button>
          </div>
        {/if}

        {#if resources.length === 0 && !showAddForm}
          <div class="empty-state card">
            <h3>No resources yet</h3>
            <p>Add a resource to start building your infrastructure</p>
          </div>
        {:else}
          <div class="resource-list">
            {#each resources as resource}
              <div class="resource-item card">
                <div class="resource-info">
                  <h3>{resource.name}</h3>
                  <span class="resource-type">{resource.type}</span>
                </div>
                <button class="btn btn-danger" on:click={() => deleteResource(resource.id)}>
                  Delete
                </button>
              </div>
            {/each}
          </div>
        {/if}
      {:else if activeTab === 'code'}
        {#if generatedCode.length === 0}
          <div class="empty-state card">
            <h3>No code generated</h3>
            <p>Add resources to see generated Pulumi code</p>
          </div>
        {:else}
          {#each generatedCode as file}
            <div class="code-file">
              <div class="code-header">{file.path}</div>
              <pre class="code-block">{file.content}</pre>
            </div>
          {/each}
        {/if}
      {:else if activeTab === 'deployments'}
        {#if deployments.length === 0}
          <div class="empty-state card">
            <h3>No deployments yet</h3>
            <p>Deploy your resources to see deployment history</p>
          </div>
        {:else}
          <div class="deployment-list">
            {#each deployments as deployment}
              <div class="deployment-item card">
                <div class="deployment-header">
                  <span class="badge {getStatusBadgeClass(deployment.status)}">
                    {deployment.status}
                  </span>
                  <span class="deployment-time">
                    {new Date(deployment.startedAt).toLocaleString()}
                  </span>
                </div>
                {#if activeDeploymentId === deployment.id && liveLogs.length > 0}
                  <div class="live-logs">
                    <div class="live-indicator">● Live</div>
                    <pre class="deployment-logs">{liveLogs.join('\n')}</pre>
                  </div>
                {:else if deployment.logs}
                  <pre class="deployment-logs">{deployment.logs}</pre>
                {/if}
                {#if deployment.error}
                  <div class="deployment-error">{deployment.error}</div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .project-meta {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--color-border);
    margin-bottom: 1.5rem;
  }

  .tab {
    padding: 0.75rem 1.5rem;
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
  }

  .tab:hover {
    color: var(--color-text);
  }

  .tab.active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .section-header h2 {
    font-size: 1.125rem;
  }

  .add-form {
    margin-bottom: 1.5rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .resource-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .resource-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .resource-info h3 {
    font-size: 1rem;
    margin-bottom: 0.25rem;
  }

  .resource-type {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-family: var(--font-mono);
  }

  .code-file {
    margin-bottom: 1.5rem;
  }

  .code-header {
    background: var(--color-bg-tertiary);
    padding: 0.5rem 1rem;
    border: 1px solid var(--color-border);
    border-bottom: none;
    border-radius: var(--radius) var(--radius) 0 0;
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  .code-file .code-block {
    border-radius: 0 0 var(--radius) var(--radius);
    margin: 0;
  }

  .deployment-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .deployment-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .deployment-time {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .deployment-logs {
    background: var(--color-bg);
    padding: 1rem;
    border-radius: var(--radius);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    max-height: 300px;
    overflow: auto;
    white-space: pre-wrap;
    color: var(--color-text-muted);
  }

  .deployment-error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid var(--color-error);
    border-radius: var(--radius);
    padding: 0.75rem;
    color: var(--color-error);
    font-size: 0.875rem;
  }

  .live-logs {
    position: relative;
  }

  .live-indicator {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    color: var(--color-success);
    font-size: 0.75rem;
    font-weight: 500;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .live-logs .deployment-logs {
    max-height: 400px;
  }
</style>
