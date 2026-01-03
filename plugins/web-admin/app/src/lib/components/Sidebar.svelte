<script lang="ts">
  import { page } from '$app/stores';

  const navItems = [
    { href: '/', label: 'Dashboard', icon: 'grid' },
    { href: '/resources', label: 'Resources', icon: 'box' },
    { href: '/deploy', label: 'Deploy', icon: 'rocket' },
    { href: '/local', label: 'Local Dev', icon: 'terminal' },
    { href: '/config', label: 'Config', icon: 'settings' },
  ];

  function isActive(href: string, currentPath: string): boolean {
    if (href === '/') return currentPath === '/';
    return currentPath.startsWith(href);
  }
</script>

<aside class="sidebar">
  <div class="sidebar-brand">
    <span class="brand-icon">S</span>
    <span class="brand-text">StackSolo</span>
  </div>

  <nav class="sidebar-nav">
    {#each navItems as item}
      <a
        href={item.href}
        class="nav-item"
        class:active={isActive(item.href, $page.url.pathname)}
      >
        <span class="nav-icon">{@html getIcon(item.icon)}</span>
        <span class="nav-label">{item.label}</span>
      </a>
    {/each}
  </nav>

  <div class="sidebar-footer">
    <a href="https://github.com/monkeybarrels/stacksolo/blob/main/docs/README.md" target="_blank" rel="noopener" class="footer-link">
      Docs
    </a>
  </div>
</aside>

<script context="module" lang="ts">
  function getIcon(name: string): string {
    const icons: Record<string, string> = {
      grid: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
      box: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
      rocket: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
      terminal: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
      settings: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    };
    return icons[name] || '';
  }
</script>

<style>
  .sidebar {
    width: 192px;
    height: 100vh;
    position: fixed;
    left: 0;
    top: 0;
    background: theme('colors.bg.secondary');
    border-right: 1px solid theme('colors.border');
    display: flex;
    flex-direction: column;
    z-index: 50;
  }

  .sidebar-brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1.25rem 1rem;
    border-bottom: 1px solid theme('colors.border');
  }

  .brand-icon {
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, theme('colors.primary.DEFAULT'), theme('colors.primary.hover'));
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 1rem;
    color: white;
  }

  .brand-text {
    font-weight: 600;
    font-size: 1rem;
  }

  .sidebar-nav {
    flex: 1;
    padding: 1rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 0.75rem;
    border-radius: 6px;
    color: theme('colors.gray.400');
    text-decoration: none;
    font-size: 0.875rem;
    transition: all 0.15s ease;
  }

  .nav-item:hover {
    background: theme('colors.bg.tertiary');
    color: theme('colors.gray.200');
  }

  .nav-item.active {
    background: rgba(59, 130, 246, 0.15);
    color: theme('colors.primary.DEFAULT');
  }

  .nav-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
  }

  .sidebar-footer {
    padding: 1rem;
    border-top: 1px solid theme('colors.border');
  }

  .footer-link {
    font-size: 0.75rem;
    color: theme('colors.gray.500');
    text-decoration: none;
  }

  .footer-link:hover {
    color: theme('colors.gray.300');
  }
</style>
