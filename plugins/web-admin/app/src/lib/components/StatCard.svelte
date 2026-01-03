<script lang="ts">
  export let count: number;
  export let label: string;
  export let icon: string = '';
  export let status: 'normal' | 'warning' | 'error' = 'normal';
</script>

<div class="stat-card" class:warning={status === 'warning'} class:error={status === 'error'}>
  <div class="stat-icon">
    {#if icon}
      {@html icon}
    {:else}
      <span class="stat-count-large">{count}</span>
    {/if}
  </div>
  <div class="stat-info">
    <span class="stat-count">{count}</span>
    <span class="stat-label">{label}</span>
  </div>
  {#if status !== 'normal'}
    <div class="stat-indicator" class:warning={status === 'warning'} class:error={status === 'error'}></div>
  {/if}
</div>

<style>
  .stat-card {
    background: theme('colors.bg.secondary');
    border: 1px solid theme('colors.border');
    border-radius: 8px;
    padding: 1.25rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    position: relative;
    transition: border-color 0.15s ease;
  }

  .stat-card:hover {
    border-color: theme('colors.gray.600');
  }

  .stat-card.warning {
    border-color: theme('colors.warning');
  }

  .stat-card.error {
    border-color: theme('colors.error');
  }

  .stat-icon {
    width: 48px;
    height: 48px;
    background: theme('colors.bg.tertiary');
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: theme('colors.gray.400');
  }

  .stat-icon :global(svg) {
    width: 24px;
    height: 24px;
  }

  .stat-count-large {
    font-size: 1.5rem;
    font-weight: 700;
    color: theme('colors.gray.200');
  }

  .stat-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .stat-count {
    font-size: 1.5rem;
    font-weight: 600;
    color: theme('colors.gray.100');
    line-height: 1;
  }

  .stat-label {
    font-size: 0.8125rem;
    color: theme('colors.gray.500');
  }

  .stat-indicator {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .stat-indicator.warning {
    background: theme('colors.warning');
  }

  .stat-indicator.error {
    background: theme('colors.error');
  }
</style>
