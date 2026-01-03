<script lang="ts">
  import { onMount, afterUpdate } from 'svelte';

  export let lines: LogLine[] = [];
  export let maxLines: number = 1000;
  export let autoScroll: boolean = true;
  export let showTimestamps: boolean = true;

  export interface LogLine {
    id: string;
    timestamp: string;
    message: string;
    level: 'info' | 'success' | 'warning' | 'error';
    service?: string;
  }

  let container: HTMLDivElement;
  let shouldAutoScroll = autoScroll;

  function handleScroll() {
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    // If user scrolls up, disable auto-scroll
    // If user scrolls to bottom, re-enable auto-scroll
    shouldAutoScroll = scrollHeight - scrollTop - clientHeight < 50;
  }

  afterUpdate(() => {
    if (shouldAutoScroll && container) {
      container.scrollTop = container.scrollHeight;
    }
  });

  function getLevelClass(level: string): string {
    switch (level) {
      case 'success': return 'text-success';
      case 'warning': return 'text-warning';
      case 'error': return 'text-error';
      default: return 'text-gray-300';
    }
  }

  function formatTimestamp(ts: string): string {
    try {
      const date = new Date(ts);
      return date.toLocaleTimeString('en-US', { hour12: false });
    } catch {
      return ts;
    }
  }

  // Keep only the last maxLines
  $: displayLines = lines.slice(-maxLines);
</script>

<div
  class="log-viewer"
  bind:this={container}
  on:scroll={handleScroll}
>
  {#each displayLines as line (line.id)}
    <div class="log-line {getLevelClass(line.level)}">
      {#if showTimestamps}
        <span class="log-timestamp">{formatTimestamp(line.timestamp)}</span>
      {/if}
      {#if line.service}
        <span class="log-service">[{line.service}]</span>
      {/if}
      <span class="log-message">{line.message}</span>
    </div>
  {/each}
  {#if displayLines.length === 0}
    <div class="log-empty">No logs yet</div>
  {/if}
</div>

<style>
  .log-viewer {
    background: theme('colors.bg.DEFAULT');
    border: 1px solid theme('colors.border');
    border-radius: 8px;
    font-family: theme('fontFamily.mono');
    font-size: 0.8125rem;
    line-height: 1.6;
    padding: 1rem;
    overflow-y: auto;
    height: 100%;
    min-height: 200px;
  }

  .log-line {
    display: flex;
    gap: 0.75rem;
    padding: 0.125rem 0;
  }

  .log-timestamp {
    color: theme('colors.gray.600');
    flex-shrink: 0;
  }

  .log-service {
    color: theme('colors.primary.DEFAULT');
    flex-shrink: 0;
  }

  .log-message {
    word-break: break-word;
  }

  .log-empty {
    color: theme('colors.gray.600');
    text-align: center;
    padding: 2rem;
  }
</style>
