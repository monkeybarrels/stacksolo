<script lang="ts">
  import { onMount } from 'svelte';
  import Header from '$lib/components/Header.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { projectStatus, resourceCounts, deployments, isLoading, error } from '$lib/stores/project';

  // Icons for stat cards
  const icons = {
    functions: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>',
    containers: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>',
    databases: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>',
    storage: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>',
    cache: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    loadBalancers: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>',
  };

  interface Activity {
    id: string;
    type: 'deploy' | 'resource' | 'config';
    description: string;
    status: 'success' | 'error' | 'pending';
    timestamp: string;
  }

  let activities: Activity[] = [];

  onMount(async () => {
    await loadDashboard();
  });

  async function loadDashboard() {
    try {
      isLoading.set(true);
      error.set(null);

      const res = await fetch('/api/project');
      if (!res.ok) throw new Error('Failed to load project');

      const data = await res.json();
      projectStatus.set(data.project);
      activities = data.activities || [];
    } catch (err) {
      error.set(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      isLoading.set(false);
    }
  }

  function formatTime(ts: string): string {
    try {
      const date = new Date(ts);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) return `${days}d ago`;
      if (hours > 0) return `${hours}h ago`;
      if (minutes > 0) return `${minutes}m ago`;
      return 'just now';
    } catch {
      return ts;
    }
  }
</script>

<svelte:head>
  <title>Dashboard - StackSolo Admin</title>
</svelte:head>

<Header title="Dashboard" />

<div class="dashboard">
  {#if $error}
    <div class="error-banner">
      <span>{$error}</span>
      <button on:click={loadDashboard}>Retry</button>
    </div>
  {/if}

  <!-- Resource Stats -->
  <section class="stats-section">
    <h2 class="section-title">Resources</h2>
    <div class="stats-grid">
      {#if $isLoading}
        {#each Array(6) as _}
          <div class="skeleton-card">
            <Skeleton width="32px" height="32px" rounded="md" />
            <Skeleton width="60%" height="1.5rem" />
            <Skeleton width="40%" height="0.875rem" />
          </div>
        {/each}
      {:else}
        <StatCard count={$resourceCounts.functions} label="Functions" icon={icons.functions} />
        <StatCard count={$resourceCounts.containers} label="Containers" icon={icons.containers} />
        <StatCard count={$resourceCounts.databases} label="Databases" icon={icons.databases} />
        <StatCard count={$resourceCounts.storage} label="Storage" icon={icons.storage} />
        <StatCard count={$resourceCounts.cache} label="Cache" icon={icons.cache} />
        <StatCard count={$resourceCounts.loadBalancers} label="Load Balancers" icon={icons.loadBalancers} />
      {/if}
    </div>
  </section>

  <!-- Quick Actions -->
  <section class="actions-section">
    <h2 class="section-title">Quick Actions</h2>
    <div class="actions-row">
      <a href="/deploy" class="action-btn primary">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>
        Deploy Now
      </a>
      <a href="/local" class="action-btn">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
        Local Dev
      </a>
      <a href="/config" class="action-btn">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        Open Config
      </a>
    </div>
  </section>

  <!-- Recent Activity -->
  <section class="activity-section">
    <h2 class="section-title">Recent Activity</h2>
    <div class="activity-list">
      {#if activities.length === 0}
        <div class="activity-empty">No recent activity</div>
      {:else}
        {#each activities as activity}
          <div class="activity-item">
            <span class="activity-icon" class:success={activity.status === 'success'} class:error={activity.status === 'error'} class:pending={activity.status === 'pending'}>
              {#if activity.status === 'success'}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              {:else if activity.status === 'error'}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              {:else}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {/if}
            </span>
            <span class="activity-desc">{activity.description}</span>
            <span class="activity-time">{formatTime(activity.timestamp)}</span>
          </div>
        {/each}
      {/if}
    </div>
  </section>
</div>

<style>
  .dashboard {
    padding: 1.5rem;
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: theme('colors.gray.400');
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 1rem;
  }

  .stats-section {
    margin-bottom: 2rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
  }

  .skeleton-card {
    background: theme('colors.bg.secondary');
    border: 1px solid theme('colors.border');
    border-radius: 8px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .actions-section {
    margin-bottom: 2rem;
  }

  .actions-row {
    display: flex;
    gap: 0.75rem;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1rem;
    background: theme('colors.bg.secondary');
    border: 1px solid theme('colors.border');
    border-radius: 6px;
    color: theme('colors.gray.300');
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: none;
    transition: all 0.15s ease;
  }

  .action-btn:hover {
    background: theme('colors.bg.tertiary');
    border-color: theme('colors.gray.600');
  }

  .action-btn.primary {
    background: theme('colors.primary.DEFAULT');
    border-color: theme('colors.primary.DEFAULT');
    color: white;
  }

  .action-btn.primary:hover {
    background: theme('colors.primary.hover');
    border-color: theme('colors.primary.hover');
  }

  .activity-section {
    background: theme('colors.bg.secondary');
    border: 1px solid theme('colors.border');
    border-radius: 8px;
    padding: 1.25rem;
  }

  .activity-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .activity-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid theme('colors.border');
  }

  .activity-item:last-child {
    border-bottom: none;
  }

  .activity-icon {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .activity-icon.success {
    background: rgba(34, 197, 94, 0.15);
    color: theme('colors.success');
  }

  .activity-icon.error {
    background: rgba(239, 68, 68, 0.15);
    color: theme('colors.error');
  }

  .activity-icon.pending {
    background: rgba(59, 130, 246, 0.15);
    color: theme('colors.primary.DEFAULT');
  }

  .activity-desc {
    flex: 1;
    font-size: 0.875rem;
    color: theme('colors.gray.200');
  }

  .activity-time {
    font-size: 0.75rem;
    color: theme('colors.gray.500');
  }

  .activity-empty {
    text-align: center;
    padding: 2rem;
    color: theme('colors.gray.500');
  }

  .error-banner {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid theme('colors.error');
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-bottom: 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: theme('colors.error');
    font-size: 0.875rem;
  }

  .error-banner button {
    background: theme('colors.error');
    color: white;
    border: none;
    padding: 0.375rem 0.75rem;
    border-radius: 4px;
    font-size: 0.8125rem;
    cursor: pointer;
  }
</style>
