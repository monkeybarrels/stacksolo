<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import { projectStatus, isLoading } from '$lib/stores/project';

  onMount(async () => {
    // Load project info for the header on any page
    if (!$projectStatus) {
      try {
        isLoading.set(true);
        const res = await fetch('/api/project');
        if (res.ok) {
          const data = await res.json();
          projectStatus.set(data.project);
        }
      } catch {
        // Ignore - header will show "No project loaded"
      } finally {
        isLoading.set(false);
      }
    }
  });
</script>

<div class="app-layout">
  <Sidebar />
  <div class="main-content">
    <slot />
  </div>
</div>

<style>
  .app-layout {
    min-height: 100vh;
  }

  .main-content {
    margin-left: 192px;
    min-height: 100vh;
    background: theme('colors.bg.DEFAULT');
  }
</style>
