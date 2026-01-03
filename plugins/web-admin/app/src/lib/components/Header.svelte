<script lang="ts">
  import { projectStatus, isLocalDevRunning } from '$lib/stores/project';

  export let title: string = '';
</script>

<header class="header">
  <div class="header-left">
    <h1 class="page-title">{title}</h1>
  </div>

  <div class="header-right">
    {#if $projectStatus}
      <div class="project-info">
        <span class="info-item">
          <span class="info-label">Project</span>
          <span class="info-value">{$projectStatus.name}</span>
        </span>
        <span class="info-divider"></span>
        <span class="info-item">
          <span class="info-label">Region</span>
          <span class="info-value">{$projectStatus.region}</span>
        </span>
        <span class="info-divider"></span>
        <span class="info-item">
          <span class="info-label">Status</span>
          <span class="status-badge" class:running={$isLocalDevRunning}>
            {$isLocalDevRunning ? 'Dev Running' : 'Idle'}
          </span>
        </span>
      </div>
    {:else}
      <div class="project-info">
        <span class="info-value text-gray-500">No project loaded</span>
      </div>
    {/if}
  </div>
</header>

<style>
  .header {
    height: 64px;
    background: theme('colors.bg.secondary');
    border-bottom: 1px solid theme('colors.border');
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.5rem;
  }

  .page-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: theme('colors.gray.100');
  }

  .project-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .info-label {
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: theme('colors.gray.500');
  }

  .info-value {
    font-size: 0.8125rem;
    color: theme('colors.gray.200');
  }

  .info-divider {
    width: 1px;
    height: 24px;
    background: theme('colors.border');
  }

  .status-badge {
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    background: theme('colors.bg.tertiary');
    color: theme('colors.gray.400');
  }

  .status-badge.running {
    background: rgba(34, 197, 94, 0.15);
    color: theme('colors.success');
  }
</style>
