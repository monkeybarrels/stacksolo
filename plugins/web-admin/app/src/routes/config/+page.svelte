<script lang="ts">
  import { onMount } from 'svelte';
  import Header from '$lib/components/Header.svelte';
  import JsonEditor from '$lib/components/JsonEditor.svelte';

  let configContent = '';
  let originalContent = '';
  let configPath = '';
  let isJson = false;
  let loading = true;
  let saving = false;
  let error: string | null = null;

  // Validation state
  let isValid = true;
  let validationErrors: string[] = [];

  onMount(async () => {
    await loadConfig();
  });

  async function loadConfig() {
    try {
      loading = true;
      error = null;

      const res = await fetch('/api/config');
      if (!res.ok) throw new Error('Failed to load config');

      const data = await res.json();
      configContent = data.content || '';
      originalContent = configContent;
      configPath = data.path || '';
      isJson = data.isJson || false;
      validateConfig();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load config';
    } finally {
      loading = false;
    }
  }

  async function saveConfig() {
    if (!isValid) {
      alert('Please fix validation errors before saving');
      return;
    }

    try {
      saving = true;
      error = null;

      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: configContent }),
      });

      if (!res.ok) throw new Error('Failed to save config');

      originalContent = configContent;
      alert('Config saved successfully');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save config';
    } finally {
      saving = false;
    }
  }

  async function validateConfig() {
    try {
      const res = await fetch('/api/config/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: configContent, isJson }),
      });

      const data = await res.json();
      isValid = data.valid;
      validationErrors = data.errors || [];
    } catch {
      // If validation endpoint fails, assume valid
      isValid = true;
      validationErrors = [];
    }
  }

  function handleEditorChange(event: CustomEvent<string>) {
    configContent = event.detail;
    validateConfig();
  }

  function formatConfig() {
    if (isJson) {
      try {
        const parsed = JSON.parse(configContent);
        configContent = JSON.stringify(parsed, null, 2);
      } catch {
        // Invalid JSON, can't format
      }
    }
  }

  function resetConfig() {
    if (confirm('Discard changes and reload config?')) {
      configContent = originalContent;
      validateConfig();
    }
  }

  $: hasChanges = configContent !== originalContent;
</script>

<svelte:head>
  <title>Config - StackSolo Admin</title>
</svelte:head>

<Header title="Config" />

<div class="config-page">
  {#if error}
    <div class="error-banner">
      <span>{error}</span>
      <button on:click={loadConfig}>Retry</button>
    </div>
  {/if}

  <!-- Toolbar -->
  <div class="toolbar">
    <div class="toolbar-left">
      <div class="validation-status" class:valid={isValid} class:invalid={!isValid}>
        <span class="status-dot"></span>
        <span class="status-text">{isValid ? 'Valid JSON' : 'Invalid JSON'}</span>
      </div>
      {#if configPath}
        <span class="file-path">{configPath.split('/').slice(-2).join('/')}</span>
      {/if}
    </div>
    <div class="toolbar-actions">
      {#if isJson}
        <button
          class="toolbar-btn"
          on:click={formatConfig}
          disabled={loading}
          title="Format JSON (Cmd+S in editor)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
          Format
        </button>
      {/if}
      <button
        class="toolbar-btn"
        on:click={resetConfig}
        disabled={!hasChanges || loading}
      >
        Reset
      </button>
      <button
        class="toolbar-btn save"
        on:click={saveConfig}
        disabled={!hasChanges || !isValid || loading || saving}
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  </div>

  <!-- Validation Errors -->
  {#if !isValid && validationErrors.length > 0}
    <div class="validation-errors">
      <h3>Validation Errors</h3>
      <ul>
        {#each validationErrors as err}
          <li>{err}</li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- Editor -->
  <div class="editor-container">
    {#if loading}
      <div class="loading">Loading config...</div>
    {:else if isJson}
      <JsonEditor value={configContent} on:change={handleEditorChange} />
    {:else}
      <!-- Fallback textarea for TypeScript config -->
      <div class="editor">
        <textarea
          class="editor-textarea"
          bind:value={configContent}
          on:input={() => validateConfig()}
          spellcheck="false"
          placeholder="// stacksolo.config.ts"
        ></textarea>
      </div>
    {/if}
  </div>

  <!-- Help -->
  <div class="help-section">
    <div class="help-row">
      <div class="help-shortcuts">
        <span class="shortcut"><kbd>Cmd</kbd>+<kbd>S</kbd> Format</span>
        <span class="shortcut"><kbd>Cmd</kbd>+<kbd>F</kbd> Find</span>
        <span class="shortcut"><kbd>Cmd</kbd>+<kbd>Z</kbd> Undo</span>
      </div>
      <div class="help-links">
        <a href="https://github.com/monkeybarrels/stacksolo/blob/main/docs/configuration.md" target="_blank" rel="noopener">Configuration Docs</a>
        <a href="https://github.com/monkeybarrels/stacksolo/blob/main/docs/plugin-development.md" target="_blank" rel="noopener">Plugin Development</a>
      </div>
    </div>
  </div>
</div>

<style>
  .config-page {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: calc(100vh - 64px);
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: theme('colors.bg.secondary');
    border: 1px solid theme('colors.border');
    border-radius: 8px;
    padding: 0.75rem 1rem;
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .file-path {
    font-family: theme('fontFamily.mono');
    font-size: 0.75rem;
    color: theme('colors.gray.500');
    background: theme('colors.bg.tertiary');
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }

  .validation-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: theme('colors.gray.500');
  }

  .validation-status.valid .status-dot {
    background: theme('colors.success');
  }

  .validation-status.invalid .status-dot {
    background: theme('colors.error');
  }

  .status-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: theme('colors.gray.400');
  }

  .validation-status.valid .status-text {
    color: theme('colors.success');
  }

  .validation-status.invalid .status-text {
    color: theme('colors.error');
  }

  .toolbar-actions {
    display: flex;
    gap: 0.5rem;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.875rem;
    background: theme('colors.bg.tertiary');
    border: 1px solid theme('colors.border');
    border-radius: 6px;
    color: theme('colors.gray.300');
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
  }

  .toolbar-btn:hover:not(:disabled) {
    background: theme('colors.border');
  }

  .toolbar-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .toolbar-btn.save {
    background: theme('colors.primary.DEFAULT');
    border-color: theme('colors.primary.DEFAULT');
    color: white;
  }

  .toolbar-btn.save:hover:not(:disabled) {
    background: theme('colors.primary.hover');
  }

  .validation-errors {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid theme('colors.error');
    border-radius: 8px;
    padding: 1rem;
  }

  .validation-errors h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: theme('colors.error');
    margin-bottom: 0.5rem;
  }

  .validation-errors ul {
    list-style: disc;
    margin-left: 1.5rem;
  }

  .validation-errors li {
    font-size: 0.8125rem;
    color: theme('colors.error');
    margin-bottom: 0.25rem;
  }

  .editor-container {
    flex: 1;
    min-height: 0;
    background: #0d1117;
    border: 1px solid theme('colors.border');
    border-radius: 8px;
    overflow: hidden;
  }

  .editor {
    height: 100%;
  }

  .editor-textarea {
    width: 100%;
    height: 100%;
    padding: 1rem;
    background: transparent;
    border: none;
    color: theme('colors.gray.200');
    font-family: theme('fontFamily.mono');
    font-size: 0.8125rem;
    line-height: 1.6;
    resize: none;
    outline: none;
    white-space: pre;
    overflow: auto;
  }

  .editor-textarea::placeholder {
    color: theme('colors.gray.600');
  }

  .help-section {
    background: theme('colors.bg.secondary');
    border: 1px solid theme('colors.border');
    border-radius: 8px;
    padding: 0.75rem 1rem;
  }

  .help-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .help-shortcuts {
    display: flex;
    gap: 1.5rem;
  }

  .shortcut {
    font-size: 0.75rem;
    color: theme('colors.gray.500');
  }

  kbd {
    background: theme('colors.bg.tertiary');
    border: 1px solid theme('colors.border');
    border-radius: 3px;
    padding: 0.125rem 0.375rem;
    font-family: theme('fontFamily.mono');
    font-size: 0.6875rem;
    color: theme('colors.gray.400');
  }

  .help-links {
    display: flex;
    gap: 1rem;
  }

  .help-links a {
    font-size: 0.8125rem;
    color: theme('colors.primary.DEFAULT');
  }

  .error-banner {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid theme('colors.error');
    border-radius: 8px;
    padding: 0.75rem 1rem;
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

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: theme('colors.gray.500');
  }
</style>
