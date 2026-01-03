<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Header from '$lib/components/Header.svelte';
  import LogViewer from '$lib/components/LogViewer.svelte';
  import type { LogLine } from '$lib/components/LogViewer.svelte';
  import { localDevStatus, type LocalService } from '$lib/stores/project';

  let loading = true;
  let error: string | null = null;
  let logs: LogLine[] = [];
  let selectedService = 'all';
  let eventSource: EventSource | null = null;

  let services: LocalService[] = [];
  let isRunning = false;
  let uptime = 0;
  let cpu = 0;
  let memory = 0;
  let logsExpanded = false;

  onMount(async () => {
    await loadStatus();
    startLogStream();
  });

  onDestroy(() => {
    if (eventSource) {
      eventSource.close();
    }
  });

  async function loadStatus() {
    try {
      loading = true;
      error = null;

      const res = await fetch('/api/local/status');
      if (!res.ok) throw new Error('Failed to load status');

      const data = await res.json();
      services = data.services || [];
      isRunning = data.running || false;
      uptime = data.uptime || 0;
      cpu = data.cpu || 0;
      memory = data.memory || 0;

      localDevStatus.set(data);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load status';
    } finally {
      loading = false;
    }
  }

  function startLogStream() {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource(`/api/local/logs?service=${selectedService}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      logs = [...logs, {
        id: crypto.randomUUID(),
        timestamp: data.timestamp || new Date().toISOString(),
        message: data.message,
        level: data.level || 'info',
        service: data.service,
      }];

      // Keep only last 1000 lines
      if (logs.length > 1000) {
        logs = logs.slice(-1000);
      }
    };
  }

  async function startLocalDev() {
    try {
      const res = await fetch('/api/local/start', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to start');
      await loadStatus();
    } catch (err) {
      alert('Failed to start local dev');
    }
  }

  async function stopLocalDev() {
    try {
      const res = await fetch('/api/local/stop', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to stop');
      await loadStatus();
    } catch (err) {
      alert('Failed to stop local dev');
    }
  }

  function onServiceChange() {
    logs = [];
    startLogStream();
  }

  function formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  }

  function getStatusClass(status: string): string {
    switch (status) {
      case 'running': return 'success';
      case 'stopped': return 'muted';
      case 'error': return 'error';
      case 'starting': return 'warning';
      default: return 'muted';
    }
  }

  let restartingServices: Set<string> = new Set();

  async function restartService(serviceName: string) {
    if (restartingServices.has(serviceName)) return;

    restartingServices.add(serviceName);
    restartingServices = restartingServices;

    try {
      const res = await fetch('/api/local/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: serviceName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to restart');
      }

      // Wait a moment then refresh status
      setTimeout(async () => {
        await loadStatus();
        restartingServices.delete(serviceName);
        restartingServices = restartingServices;
      }, 2000);
    } catch (err) {
      alert(`Failed to restart ${serviceName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      restartingServices.delete(serviceName);
      restartingServices = restartingServices;
    }
  }
</script>

<svelte:head>
  <title>Local Dev - StackSolo Admin</title>
</svelte:head>

<Header title="Local Dev" />

<div class="local-page" class:logs-expanded={logsExpanded}>
  <!-- Status Bar -->
  <section class="status-section">
    <div class="status-bar">
      <div class="status-item">
        <span class="status-label">Status</span>
        <span class="status-value" class:running={isRunning}>
          {isRunning ? 'Running' : 'Stopped'}
        </span>
      </div>
      <div class="status-item">
        <span class="status-label">Uptime</span>
        <span class="status-value">{formatUptime(uptime)}</span>
      </div>
      <div class="status-item">
        <span class="status-label">CPU</span>
        <span class="status-value">{cpu.toFixed(1)}%</span>
      </div>
      <div class="status-item">
        <span class="status-label">Memory</span>
        <span class="status-value">{memory.toFixed(0)} MB</span>
      </div>
      <div class="status-actions">
        {#if isRunning}
          <button class="action-btn stop" on:click={stopLocalDev}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            Stop
          </button>
        {:else}
          <button class="action-btn start" on:click={startLocalDev}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Start
          </button>
        {/if}
        <button class="action-btn" on:click={loadStatus}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Refresh
        </button>
      </div>
    </div>
  </section>

  <!-- Services Table -->
  <section class="services-section">
    <h2 class="section-title">Services</h2>
    <div class="services-table-container">
      {#if loading}
        <div class="loading">Loading services...</div>
      {:else if error}
        <div class="error">{error}</div>
      {:else if services.length === 0}
        <div class="empty">No services configured</div>
      {:else}
        <table class="services-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Status</th>
              <th>Port</th>
              <th>URL</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each services as service}
              <tr>
                <td class="service-name">{service.name}</td>
                <td>
                  <span class="status-badge {getStatusClass(service.status)}">{service.status}</span>
                </td>
                <td class="service-port">{service.port || '-'}</td>
                <td>
                  {#if service.url}
                    <a href={service.url} target="_blank" rel="noopener" class="service-url">
                      {service.url}
                    </a>
                  {:else}
                    <span class="service-url muted">-</span>
                  {/if}
                </td>
                <td>
                  <button
                    class="restart-btn"
                    on:click={() => restartService(service.name)}
                    disabled={restartingServices.has(service.name)}
                    title="Restart {service.name}"
                  >
                    {#if restartingServices.has(service.name)}
                      <svg class="spinning" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    {:else}
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
                    {/if}
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </section>

  <!-- Logs -->
  <section class="logs-section">
    <div class="logs-header">
      <h2 class="section-title">Logs</h2>
      <div class="logs-controls">
        <select class="service-select" bind:value={selectedService} on:change={onServiceChange}>
          <option value="all">All Services</option>
          {#each services as service}
            <option value={service.name}>{service.name}</option>
          {/each}
        </select>
        <button class="expand-btn" on:click={() => logsExpanded = !logsExpanded} title={logsExpanded ? 'Collapse' : 'Expand'}>
          {#if logsExpanded}
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          {/if}
        </button>
      </div>
    </div>
    <div class="logs-container">
      <LogViewer lines={logs} maxLines={1000} />
    </div>
  </section>
</div>

<style>
  .local-page {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    height: calc(100vh - 64px);
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: theme('colors.gray.400');
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 1rem;
  }

  .status-section {
    background: theme('colors.bg.secondary');
    border: 1px solid theme('colors.border');
    border-radius: 8px;
    padding: 1rem 1.25rem;
  }

  .status-bar {
    display: flex;
    align-items: center;
    gap: 2rem;
  }

  .status-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .status-label {
    font-size: 0.6875rem;
    color: theme('colors.gray.500');
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status-value {
    font-size: 1rem;
    font-weight: 600;
    color: theme('colors.gray.300');
  }

  .status-value.running {
    color: theme('colors.success');
  }

  .status-actions {
    margin-left: auto;
    display: flex;
    gap: 0.5rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    background: theme('colors.bg.tertiary');
    border: 1px solid theme('colors.border');
    border-radius: 6px;
    color: theme('colors.gray.300');
    font-size: 0.8125rem;
    cursor: pointer;
  }

  .action-btn:hover {
    background: theme('colors.border');
  }

  .action-btn.start {
    background: theme('colors.success');
    border-color: theme('colors.success');
    color: white;
  }

  .action-btn.start:hover {
    background: #16a34a;
  }

  .action-btn.stop {
    background: theme('colors.error');
    border-color: theme('colors.error');
    color: white;
  }

  .action-btn.stop:hover {
    background: #dc2626;
  }

  .services-section {
    background: theme('colors.bg.secondary');
    border: 1px solid theme('colors.border');
    border-radius: 8px;
    padding: 1.25rem;
  }

  .services-table-container {
    overflow-x: auto;
  }

  .services-table {
    width: 100%;
    border-collapse: collapse;
  }

  .services-table th {
    text-align: left;
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: theme('colors.gray.500');
    border-bottom: 1px solid theme('colors.border');
  }

  .services-table td {
    padding: 0.75rem;
    border-bottom: 1px solid theme('colors.border');
  }

  .service-name {
    font-weight: 500;
    color: theme('colors.gray.200');
  }

  .service-port {
    font-family: theme('fontFamily.mono');
    font-size: 0.875rem;
    color: theme('colors.gray.400');
  }

  .service-url {
    font-size: 0.8125rem;
    color: theme('colors.primary.DEFAULT');
  }

  .service-url.muted {
    color: theme('colors.gray.600');
  }

  .status-badge {
    display: inline-flex;
    padding: 0.25rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .status-badge.success {
    background: rgba(34, 197, 94, 0.15);
    color: theme('colors.success');
  }

  .status-badge.error {
    background: rgba(239, 68, 68, 0.15);
    color: theme('colors.error');
  }

  .status-badge.warning {
    background: rgba(245, 158, 11, 0.15);
    color: theme('colors.warning');
  }

  .status-badge.muted {
    background: theme('colors.bg.tertiary');
    color: theme('colors.gray.500');
  }

  .restart-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: theme('colors.bg.tertiary');
    border: 1px solid theme('colors.border');
    border-radius: 4px;
    color: theme('colors.gray.400');
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .restart-btn:hover:not(:disabled) {
    background: theme('colors.border');
    color: theme('colors.gray.200');
  }

  .restart-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .restart-btn .spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .logs-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .logs-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .logs-header .section-title {
    margin-bottom: 0;
  }

  .logs-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .service-select {
    padding: 0.375rem 0.75rem;
    background: theme('colors.bg.secondary');
    border: 1px solid theme('colors.border');
    border-radius: 6px;
    color: theme('colors.gray.200');
    font-size: 0.8125rem;
  }

  .expand-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: theme('colors.bg.tertiary');
    border: 1px solid theme('colors.border');
    border-radius: 6px;
    color: theme('colors.gray.400');
    cursor: pointer;
  }

  .expand-btn:hover {
    background: theme('colors.border');
    color: theme('colors.gray.200');
  }

  .logs-container {
    flex: 1;
    min-height: 0;
  }

  /* Expanded logs state */
  .local-page.logs-expanded {
    position: fixed;
    top: 64px;
    left: 192px;
    right: 0;
    bottom: 0;
    z-index: 50;
    background: theme('colors.bg.DEFAULT');
  }

  .local-page.logs-expanded .status-section,
  .local-page.logs-expanded .services-section {
    display: none;
  }

  .local-page.logs-expanded .logs-section {
    flex: 1;
    height: 100%;
  }

  .loading, .error, .empty {
    text-align: center;
    padding: 2rem;
    color: theme('colors.gray.500');
  }

  .error {
    color: theme('colors.error');
  }
</style>
