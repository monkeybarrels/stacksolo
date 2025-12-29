<script lang="ts">
  import { onMount } from 'svelte';
  import { trpc } from '$lib/trpc/client';

  interface Project {
    id: string;
    name: string;
    provider: string;
    providerConfig: { projectId?: string; region?: string };
    createdAt: string;
  }

  let projects: Project[] = [];
  let loading = true;
  let error: string | null = null;

  onMount(async () => {
    try {
      projects = await trpc.projects.list.query();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load projects';
    } finally {
      loading = false;
    }
  });

  async function deleteProject(id: string) {
    if (!confirm('Are you sure you want to delete this project?')) return;

    try {
      await trpc.projects.delete.mutate({ id });
      projects = projects.filter(p => p.id !== id);
    } catch (err) {
      alert('Failed to delete project');
    }
  }
</script>

<svelte:head>
  <title>Projects - StackSolo</title>
</svelte:head>

<div class="container">
  <div class="page-header">
    <h1 class="page-title">Projects</h1>
    <a href="/projects/new" class="btn btn-primary">+ New Project</a>
  </div>

  {#if loading}
    <div class="empty-state">Loading...</div>
  {:else if error}
    <div class="empty-state">
      <p style="color: var(--color-error)">{error}</p>
    </div>
  {:else if projects.length === 0}
    <div class="empty-state card">
      <h3>No projects yet</h3>
      <p>Create your first project to get started</p>
      <a href="/projects/new" class="btn btn-primary" style="margin-top: 1rem">Create Project</a>
    </div>
  {:else}
    <div class="project-list">
      {#each projects as project}
        <div class="project-item card">
          <div class="project-info">
            <a href="/projects/{project.id}" class="project-name">{project.name}</a>
            <div class="project-meta">
              <span class="badge badge-pending">{project.provider.toUpperCase()}</span>
              {#if project.providerConfig.projectId}
                <span class="project-detail">{project.providerConfig.projectId}</span>
              {/if}
              {#if project.providerConfig.region}
                <span class="project-detail">{project.providerConfig.region}</span>
              {/if}
            </div>
          </div>
          <div class="project-actions">
            <a href="/projects/{project.id}" class="btn btn-secondary">Open</a>
            <button class="btn btn-danger" on:click={() => deleteProject(project.id)}>Delete</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .project-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .project-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .project-name {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 0.5rem;
    display: block;
  }

  .project-name:hover {
    color: var(--color-primary);
  }

  .project-meta {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .project-detail {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .project-actions {
    display: flex;
    gap: 0.5rem;
  }
</style>
