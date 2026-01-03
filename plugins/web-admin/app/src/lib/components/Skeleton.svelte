<script lang="ts">
  export let width: string = '100%';
  export let height: string = '1rem';
  export let rounded: 'sm' | 'md' | 'lg' | 'full' = 'md';
</script>

<div
  class="skeleton rounded-{rounded}"
  style="width: {width}; height: {height};"
></div>

<style>
  .skeleton {
    background: linear-gradient(
      90deg,
      theme('colors.bg.tertiary') 25%,
      theme('colors.gray.700') 50%,
      theme('colors.bg.tertiary') 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .rounded-sm {
    border-radius: 4px;
  }
  .rounded-md {
    border-radius: 6px;
  }
  .rounded-lg {
    border-radius: 8px;
  }
  .rounded-full {
    border-radius: 9999px;
  }
</style>
