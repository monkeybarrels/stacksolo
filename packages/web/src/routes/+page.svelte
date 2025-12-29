<script lang="ts">
  import { onMount } from 'svelte';
  import { trpc } from '$lib/trpc/client';

  let projects: any[] = [];
  let loading = true;

  onMount(async () => {
    try {
      projects = await trpc.projects.list.query();
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>StackSolo - Infrastructure for Solo Developers</title>
</svelte:head>

<div class="container">
  <section class="hero">
    <h1>Infrastructure for Solo Developers</h1>
    <p class="hero-sub">
      Design, preview, and deploy cloud resources with clean, exportable Pulumi code.
    </p>
    <div class="hero-actions">
      <a href="/projects/new" class="btn btn-primary">Create Project</a>
      <a href="/projects" class="btn btn-secondary">View Projects</a>
    </div>
  </section>

  <section class="features">
    <div class="feature">
      <div class="feature-icon">🎨</div>
      <h3>Visual Builder</h3>
      <p>Configure resources through forms, not YAML</p>
    </div>
    <div class="feature">
      <div class="feature-icon">📦</div>
      <h3>Real Pulumi Code</h3>
      <p>See and own the TypeScript that powers your stack</p>
    </div>
    <div class="feature">
      <div class="feature-icon">🚀</div>
      <h3>One-Click Deploy</h3>
      <p>Deploy to your cloud with a single click</p>
    </div>
  </section>

  {#if !loading && projects.length > 0}
    <section class="recent">
      <h2>Recent Projects</h2>
      <div class="project-grid">
        {#each projects.slice(0, 3) as project}
          <a href="/projects/{project.id}" class="project-card card">
            <h3>{project.name}</h3>
            <span class="badge badge-pending">{project.provider.toUpperCase()}</span>
          </a>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .hero {
    text-align: center;
    padding: 4rem 0;
  }

  .hero h1 {
    font-size: 2.5rem;
    margin-bottom: 1rem;
  }

  .hero-sub {
    font-size: 1.125rem;
    color: var(--color-text-muted);
    margin-bottom: 2rem;
  }

  .hero-actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
  }

  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin: 4rem 0;
  }

  .feature {
    text-align: center;
    padding: 2rem;
  }

  .feature-icon {
    font-size: 2.5rem;
    margin-bottom: 1rem;
  }

  .feature h3 {
    margin-bottom: 0.5rem;
  }

  .feature p {
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .recent {
    margin-top: 4rem;
  }

  .recent h2 {
    margin-bottom: 1.5rem;
  }

  .project-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1rem;
  }

  .project-card {
    display: block;
    color: var(--color-text);
  }

  .project-card:hover {
    text-decoration: none;
    border-color: var(--color-primary);
  }

  .project-card h3 {
    margin-bottom: 0.5rem;
  }
</style>
