<script lang="ts">
  import { onMount } from 'svelte';
  import Header from '$lib/components/Header.svelte';
  import LogViewer from '$lib/components/LogViewer.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import type { LogLine } from '$lib/components/LogViewer.svelte';
  import { projectStatus, type Resource } from '$lib/stores/project';

  let resources: Resource[] = [];
  let loading = true;
  let error: string | null = null;

  // Filters
  let searchQuery = '';
  let typeFilter = 'all';

  // Selected resource
  let selectedResource: Resource | null = null;
  let resourceLogs: LogLine[] = [];
  let loadingLogs = false;

  const resourceTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'function', label: 'Functions' },
    { value: 'container', label: 'Containers' },
    { value: 'database', label: 'Databases' },
    { value: 'storage', label: 'Storage' },
    { value: 'cache', label: 'Cache' },
  ];

  onMount(async () => {
    await loadResources();
  });

  async function loadResources() {
    try {
      loading = true;
      error = null;

      const res = await fetch('/api/resources');
      if (!res.ok) throw new Error('Failed to load resources');

      resources = await res.json();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load resources';
    } finally {
      loading = false;
    }
  }

  async function selectResource(resource: Resource) {
    selectedResource = resource;
    await loadResourceLogs(resource.id);
  }

  async function loadResourceLogs(resourceId: string) {
    try {
      loadingLogs = true;
      resourceLogs = [];

      const res = await fetch(`/api/resources/${resourceId}/logs`);
      if (!res.ok) throw new Error('Failed to load logs');

      const data = await res.json();
      resourceLogs = data.logs || [];
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      loadingLogs = false;
    }
  }

  function getTypeIcon(type: string): string {
    const t = type.toLowerCase();
    if (t.includes('function')) return 'fn';
    if (t.includes('container') || t.includes('run')) return 'ctr';
    if (t.includes('sql') || t.includes('database')) return 'db';
    if (t.includes('bucket') || t.includes('storage')) return 'st';
    if (t.includes('redis') || t.includes('cache')) return 'ch';
    return 'res';
  }

  function getStatusClass(status: string): string {
    switch (status) {
      case 'running': return 'success';
      case 'stopped': return 'muted';
      case 'error': return 'error';
      case 'pending': return 'warning';
      default: return 'muted';
    }
  }

  $: filteredResources = resources.filter((r) => {
    const matchesSearch = !searchQuery ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.type.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = typeFilter === 'all' ||
      r.type.toLowerCase().includes(typeFilter);

    return matchesSearch && matchesType;
  });
</script>

<svelte:head>
  <title>Resources - StackSolo Admin</title>
</svelte:head>

<Header title="Resources" />

<div class="resources-page">
  <!-- Filters -->
  <div class="filters">
    <input
      type="text"
      class="search-input"
      placeholder="Search resources..."
      bind:value={searchQuery}
    />
    <select class="type-select" bind:value={typeFilter}>
      {#each resourceTypes as type}
        <option value={type.value}>{type.label}</option>
      {/each}
    </select>
    <button class="refresh-btn" on:click={loadResources}>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      Refresh
    </button>
  </div>

  <div class="content-grid">
    <!-- Resource Table -->
    <div class="table-container">
      {#if loading}
        <table class="resource-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Name</th>
              <th>Status</th>
              <th>Region</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each Array(5) as _}
              <tr>
                <td><Skeleton width="32px" height="32px" rounded="md" /></td>
                <td class="name-cell">
                  <Skeleton width="120px" height="1rem" />
                  <Skeleton width="80px" height="0.75rem" />
                </td>
                <td><Skeleton width="60px" height="1.5rem" rounded="full" /></td>
                <td><Skeleton width="80px" height="0.875rem" /></td>
                <td><Skeleton width="40px" height="0.875rem" /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else if error}
        <div class="error">{error}</div>
      {:else if filteredResources.length === 0}
        <div class="empty">No resources found</div>
      {:else}
        <table class="resource-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Name</th>
              <th>Status</th>
              <th>Region</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredResources as resource}
              <tr
                class:selected={selectedResource?.id === resource.id}
                on:click={() => selectResource(resource)}
              >
                <td>
                  <span class="type-badge">{getTypeIcon(resource.type)}</span>
                </td>
                <td class="name-cell">
                  <span class="resource-name">{resource.name}</span>
                  <span class="resource-type">{resource.type}</span>
                </td>
                <td>
                  <span class="status-badge {getStatusClass(resource.status)}">{resource.status}</span>
                </td>
                <td class="region-cell">{resource.region || '-'}</td>
                <td class="actions-cell">
                  {#if resource.url}
                    <a href={resource.url} target="_blank" rel="noopener" class="action-link">
                      Open
                    </a>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>

    <!-- Detail Panel -->
    <div class="detail-panel" class:open={selectedResource !== null}>
      {#if selectedResource}
        <div class="detail-header">
          <h3>{selectedResource.name}</h3>
          <button class="close-btn" on:click={() => selectedResource = null}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="detail-info">
          <div class="info-row">
            <span class="info-label">Type</span>
            <span class="info-value">{selectedResource.type}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Status</span>
            <span class="status-badge {getStatusClass(selectedResource.status)}">{selectedResource.status}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Provider</span>
            <span class="info-value">{selectedResource.provider}</span>
          </div>
          {#if selectedResource.region}
            <div class="info-row">
              <span class="info-label">Region</span>
              <span class="info-value">{selectedResource.region}</span>
            </div>
          {/if}
          {#if selectedResource.url}
            <div class="info-row">
              <span class="info-label">URL</span>
              <a href={selectedResource.url} target="_blank" rel="noopener" class="info-link">{selectedResource.url}</a>
            </div>
          {/if}
        </div>
        <div class="detail-logs">
          <h4>Logs</h4>
          {#if loadingLogs}
            <div class="loading">Loading logs...</div>
          {:else}
            <LogViewer lines={resourceLogs} maxLines={500} />
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .resources-page {
    padding: 1.5rem;
    height: calc(100vh - 64px);
    display: flex;
    flex-direction: column;
  }

  .filters {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .search-input {
    flex: 1;
    max-width: 300px;
    padding: 0.5rem 0.75rem;
    background: theme('colors.bg.secondary');
    border: 1px solid theme('colors.border');
    border-radius: 6px;
    color: theme('colors.gray.200');
    font-size: 0.875rem;
  }

  .search-input:focus {
    outline: none;
    border-color: theme('colors.primary.DEFAULT');
  }

  .type-select {
    padding: 0.5rem 0.75rem;
    background: theme('colors.bg.secondary');
    border: 1px solid theme('colors.border');
    border-radius: 6px;
    color: theme('colors.gray.200');
    font-size: 0.875rem;
  }

  .refresh-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: theme('colors.bg.secondary');
    border: 1px solid theme('colors.border');
    border-radius: 6px;
    color: theme('colors.gray.300');
    font-size: 0.875rem;
    cursor: pointer;
  }

  .refresh-btn:hover {
    background: theme('colors.bg.tertiary');
  }

  .content-grid {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
    min-height: 0;
  }

  .content-grid:has(.detail-panel.open) {
    grid-template-columns: 1fr 400px;
  }

  .table-container {
    background: theme('colors.bg.secondary');
    border: 1px solid theme('colors.border');
    border-radius: 8px;
    overflow: auto;
  }

  .resource-table {
    width: 100%;
    border-collapse: collapse;
  }

  .resource-table th {
    text-align: left;
    padding: 0.75rem 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: theme('colors.gray.500');
    border-bottom: 1px solid theme('colors.border');
    position: sticky;
    top: 0;
    background: theme('colors.bg.secondary');
  }

  .resource-table td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid theme('colors.border');
  }

  .resource-table tr {
    cursor: pointer;
    transition: background 0.1s ease;
  }

  .resource-table tr:hover {
    background: theme('colors.bg.tertiary');
  }

  .resource-table tr.selected {
    background: rgba(59, 130, 246, 0.1);
  }

  .type-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: theme('colors.bg.tertiary');
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    color: theme('colors.gray.400');
    text-transform: uppercase;
  }

  .name-cell {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .resource-name {
    font-weight: 500;
    color: theme('colors.gray.200');
  }

  .resource-type {
    font-size: 0.75rem;
    color: theme('colors.gray.500');
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

  .region-cell {
    color: theme('colors.gray.400');
    font-size: 0.875rem;
  }

  .action-link {
    font-size: 0.8125rem;
    color: theme('colors.primary.DEFAULT');
  }

  .detail-panel {
    display: none;
    background: theme('colors.bg.secondary');
    border: 1px solid theme('colors.border');
    border-radius: 8px;
    overflow: hidden;
  }

  .detail-panel.open {
    display: flex;
    flex-direction: column;
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid theme('colors.border');
  }

  .detail-header h3 {
    font-size: 1rem;
    font-weight: 600;
  }

  .close-btn {
    background: none;
    border: none;
    color: theme('colors.gray.500');
    cursor: pointer;
    padding: 0.25rem;
  }

  .close-btn:hover {
    color: theme('colors.gray.300');
  }

  .detail-info {
    padding: 1rem;
    border-bottom: 1px solid theme('colors.border');
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0;
  }

  .info-label {
    font-size: 0.8125rem;
    color: theme('colors.gray.500');
  }

  .info-value {
    font-size: 0.8125rem;
    color: theme('colors.gray.200');
  }

  .info-link {
    font-size: 0.8125rem;
    color: theme('colors.primary.DEFAULT');
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail-logs {
    flex: 1;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .detail-logs h4 {
    font-size: 0.8125rem;
    font-weight: 600;
    color: theme('colors.gray.400');
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.75rem;
  }

  .loading, .error, .empty {
    text-align: center;
    padding: 3rem;
    color: theme('colors.gray.500');
  }

  .error {
    color: theme('colors.error');
  }
</style>
