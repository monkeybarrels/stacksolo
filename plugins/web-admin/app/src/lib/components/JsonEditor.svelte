<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { browser } from '$app/environment';
  import { EditorView, basicSetup } from 'codemirror';
  import { json } from '@codemirror/lang-json';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { EditorState } from '@codemirror/state';

  export let value: string = '{}';
  export let readonly: boolean = false;

  const dispatch = createEventDispatcher<{ change: string }>();

  let container: HTMLDivElement;
  let view: EditorView | null = null;
  let loading = true;

  // Custom dark theme that matches our app
  const stacksoloDark = EditorView.theme({
    '&': {
      backgroundColor: '#0d1117',
      color: '#e6edf3',
    },
    '.cm-content': {
      caretColor: '#e6edf3',
      fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Source Code Pro', monospace",
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#e6edf3',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#264f78',
    },
    '.cm-panels': {
      backgroundColor: '#161b22',
      color: '#e6edf3',
    },
    '.cm-panels.cm-panels-top': {
      borderBottom: '1px solid #30363d',
    },
    '.cm-panels.cm-panels-bottom': {
      borderTop: '1px solid #30363d',
    },
    '.cm-searchMatch': {
      backgroundColor: '#264f7844',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: '#264f78',
    },
    '.cm-activeLine': {
      backgroundColor: '#161b22',
    },
    '.cm-selectionMatch': {
      backgroundColor: '#264f7844',
    },
    '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
      backgroundColor: '#264f7844',
    },
    '.cm-gutters': {
      backgroundColor: '#0d1117',
      color: '#484f58',
      border: 'none',
      borderRight: '1px solid #21262d',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#161b22',
      color: '#e6edf3',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: '#21262d',
      color: '#e6edf3',
      border: 'none',
    },
    '.cm-tooltip': {
      backgroundColor: '#161b22',
      border: '1px solid #30363d',
    },
    '.cm-tooltip .cm-tooltip-arrow:before': {
      borderTopColor: 'transparent',
      borderBottomColor: 'transparent',
    },
    '.cm-tooltip .cm-tooltip-arrow:after': {
      borderTopColor: '#161b22',
      borderBottomColor: '#161b22',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': {
        backgroundColor: '#264f78',
        color: '#e6edf3',
      },
    },
  }, { dark: true });

  onMount(() => {
    if (!browser) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newValue = update.state.doc.toString();
        if (newValue !== value) {
          value = newValue;
          dispatch('change', newValue);
        }
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        json(),
        stacksoloDark,
        oneDark,
        updateListener,
        EditorState.readOnly.of(readonly),
        EditorView.lineWrapping,
      ],
    });

    view = new EditorView({
      state,
      parent: container,
    });

    loading = false;
  });

  onDestroy(() => {
    if (view) {
      view.destroy();
    }
  });

  // Update editor when value changes externally
  $: if (view && value !== view.state.doc.toString()) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }
</script>

<div class="json-editor-container" bind:this={container}>
  {#if loading}
    <div class="loading">Loading editor...</div>
  {/if}
</div>

<style>
  .json-editor-container {
    width: 100%;
    height: 100%;
    min-height: 300px;
    position: relative;
  }

  .json-editor-container :global(.cm-editor) {
    height: 100%;
    font-size: 13px;
  }

  .json-editor-container :global(.cm-scroller) {
    overflow: auto;
    padding: 12px 0;
  }

  .loading {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #484f58;
    font-size: 0.875rem;
  }
</style>
