<script lang="ts">
  import '../app.css';
</script>

<nav class="nav">
  <div class="container nav-content">
    <a href="/" class="nav-brand">
      <span class="nav-logo">⚡</span>
      StackSolo
    </a>
    <div class="nav-links">
      <a href="/projects">Projects</a>
    </div>
  </div>
</nav>

<main class="main">
  <slot />
</main>

<style>
  .nav {
    background: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
    padding: 1rem 0;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .nav-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .nav-brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .nav-brand:hover {
    text-decoration: none;
  }

  .nav-logo {
    font-size: 1.5rem;
  }

  .nav-links {
    display: flex;
    gap: 1.5rem;
  }

  .nav-links a {
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .nav-links a:hover {
    color: var(--color-text);
    text-decoration: none;
  }

  .main {
    padding: 2rem 0;
  }
</style>
