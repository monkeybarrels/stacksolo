/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark theme palette
        bg: {
          DEFAULT: '#0f0f0f',
          secondary: '#1a1a1a',
          tertiary: '#242424',
        },
        border: '#333',
        primary: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
        },
        success: '#22c55e',
        error: '#ef4444',
        warning: '#f59e0b',
      },
      fontFamily: {
        mono: ['SF Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
