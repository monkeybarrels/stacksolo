<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Header from '$lib/components/Header.svelte';
  import LogViewer from '$lib/components/LogViewer.svelte';
  import type { LogLine } from '$lib/components/LogViewer.svelte';

  type DeployStatus = 'idle' | 'running' | 'succeeded' | 'failed';

  interface Deployment {
    id: string;
    status: DeployStatus;
    startedAt: string;
    finishedAt?: string;
    message?: string;
  }

  let status: DeployStatus = 'idle';
  let progress = 0;
  let logs: LogLine[] = [];
  let deployments: Deployment[] = [];
  let loading = true;
  let eventSource: EventSource | null = null;

  onMount(async () => {
    await loadDeploymentHistory();
  });

  onDestroy(() => {
    if (eventSource) {
      eventSource.close();
    }
  });

  async function loadDeploymentHistory() {
    try {
      loading = true;
      const res = await fetch('/api/deploy/history');
      if (!res.ok) throw new Error('Failed to load history');
      deployments = await res.json();
    } catch (err) {
      console.error('Failed to load deployment history:', err);
    } finally {
      loading = false;
    }
  }

  async function startDeploy() {
    if (status === 'running') return;

    status = 'running';
    progress = 0;
    logs = [];

    // Close existing connection
    if (eventSource) {
      eventSource.close();
    }

    // Start SSE connection
    eventSource = new EventSource('/api/deploy');

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'log') {
        logs = [...logs, {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          message: data.message,
          level: data.level || 'info',
        }];
      } else if (data.type === 'progress') {
        progress = data.progress;
      } else if (data.type === 'complete') {
        status = data.success ? 'succeeded' : 'failed';
        progress = 100;
        eventSource?.close();
        loadDeploymentHistory();
      }
    };

    eventSource.onerror = () => {
      status = 'failed';
      eventSource?.close();
    };
  }

  async function rollback(deploymentId: string) {
    if (!confirm('Are you sure you want to rollback to this deployment?')) return;

    try {
      const res = await fetch(`/api/deploy/${deploymentId}/rollback`, { method: 'POST' });
      if (!res.ok) throw new Error('Rollback failed');
      alert('Rollback initiated');
      await loadDeploymentHistory();
    } catch (err) {
      alert('Failed to rollback');
    }
  }

  function formatTime(ts: string): string {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  }

  function getStatusColor(s: DeployStatus): string {
    switch (s) {
      case 'succeeded': return 'text-success';
      case 'failed': return 'text-error';
      case 'running': return 'text-primary';
      default: return 'text-gray-400';
    }
  }
</script>

<svelte:head>
  <title>Deploy - StackSolo Admin</title>
</svelte:head>

<Header title="Deploy" />

<div class="deploy-page">
  <!-- Deploy Control -->
  <section class="deploy-section">
    <div class="deploy-header">
      <div class="deploy-status">
        <span class="status-label">Status</span>
        <span class="status-value {getStatusColor(status)}">{status}</span>
      </div>
      <button
        class="deploy-btn"
        class:running={status === 'running'}
        on:click={startDeploy}
        disabled={status === 'running'}
      >
        {#if status === 'running'}
          <svg class="spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          Deploying...
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>
          Deploy Now
        {/if}
      </button>
    </div>

    {#if status === 'running' || logs.length > 0}
      <div class="progress-section">
        <div class="progress-bar">
          <div class="progress-fill" style="width: {progress}%"></div>
        </div>
        <span class="progress-text">{progress}%</span>
      </div>
    {/if}
  </section>

  <!-- Deploy Logs -->
  <section class="logs-section">
    <h2 class="section-title">Deployment Logs</h2>
    <div class="logs-container">
      <LogViewer lines={logs} maxLines={1000} />
    </div>
  </section>

  <!-- Deployment History -->
  <section class="history-section">
    <h2 class="section-title">Deployment History</h2>
    <div class="history-list">
      {#if loading}
        <div class="loading">Loading history...</div>
      {:else if deployments.length === 0}
        <div class="empty">No deployments yet</div>
      {:else}
        {#each deployments as deployment}
          <div class="history-item">
            <div class="history-info">
              <span class="history-id">#{deployment.id.slice(0, 8)}</span>
              <span class="history-status {getStatusColor(deployment.status)}">{deployment.status}</span>
              <span class="history-time">{formatTime(deployment.startedAt)}</span>
            </div>
            <div class="history-actions">
              {#if deployment.status === 'succeeded'}
                <button class="rollback-btn" on:click={() => rollback(deployment.id)}>
                  Rollback
                </button>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </section>
</div>

<style>
  .deploy-page {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: theme('colors.gray.400');
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 1rem;
  }

  .deploy-section {
    background: theme('colors.bg.secondary');
    border: 1px solid theme('colors.border');
    border-radius: 8px;
    padding: 1.25rem;
  }

  .deploy-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .deploy-status {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .status-label {
    font-size: 0.75rem;
    color: theme('colors.gray.500');
    text-transform: uppercase;
  }

  .status-value {
    font-size: 1.125rem;
    font-weight: 600;
    text-transform: capitalize;
  }

  .text-success { color: theme('colors.success'); }
  .text-error { color: theme('colors.error'); }
  .text-primary { color: theme('colors.primary.DEFAULT'); }

  .deploy-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: theme('colors.primary.DEFAULT');
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.9375rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .deploy-btn:hover:not(:disabled) {
    background: theme('colors.primary.hover');
  }

  .deploy-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .deploy-btn.running {
    background: theme('colors.bg.tertiary');
    color: theme('colors.gray.300');
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .progress-section {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 1rem;
  }

  .progress-bar {
    flex: 1;
    height: 8px;
    background: theme('colors.bg.tertiary');
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: theme('colors.primary.DEFAULT');
    transition: width 0.3s ease;
  }

  .progress-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: theme('colors.gray.400');
    min-width: 3rem;
  }

  .logs-section {
    flex: 1;
    min-height: 300px;
    display: flex;
    flex-direction: column;
  }

  .logs-container {
    flex: 1;
    min-height: 0;
  }

  .history-section {
    background: theme('colors.bg.secondary');
    border: 1px solid theme('colors.border');
    border-radius: 8px;
    padding: 1.25rem;
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .history-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: theme('colors.bg.DEFAULT');
    border-radius: 6px;
  }

  .history-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .history-id {
    font-family: theme('fontFamily.mono');
    font-size: 0.8125rem;
    color: theme('colors.gray.400');
  }

  .history-status {
    font-size: 0.8125rem;
    font-weight: 500;
    text-transform: capitalize;
  }

  .history-time {
    font-size: 0.8125rem;
    color: theme('colors.gray.500');
  }

  .rollback-btn {
    padding: 0.375rem 0.75rem;
    background: transparent;
    border: 1px solid theme('colors.border');
    border-radius: 4px;
    color: theme('colors.gray.400');
    font-size: 0.8125rem;
    cursor: pointer;
  }

  .rollback-btn:hover {
    background: theme('colors.bg.tertiary');
    color: theme('colors.gray.200');
  }

  .loading, .empty {
    text-align: center;
    padding: 2rem;
    color: theme('colors.gray.500');
  }
</style>
