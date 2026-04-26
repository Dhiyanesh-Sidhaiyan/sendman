/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: v('bg'),
          panel: v('bg-panel'),
          elev: v('bg-elev'),
          border: v('bg-border')
        },
        accent: {
          DEFAULT: v('accent'),
          dim: v('accent-dim')
        },
        method: {
          get: v('method-get'),
          post: v('method-post'),
          put: v('method-put'),
          patch: v('method-patch'),
          delete: v('method-delete')
        },
        // Override Tailwind defaults so existing text-zinc-*, text-yellow-*, text-red-*
        // classes flip with the theme via CSS variables.
        zinc: {
          200: v('zinc-200'),
          300: v('zinc-300'),
          400: v('zinc-400'),
          500: v('zinc-500'),
          600: v('zinc-600')
        },
        yellow: {
          400: v('yellow-400'),
          500: v('yellow-500'),
          600: v('yellow-600')
        },
        red: {
          400: v('red-400'),
          500: v('red-500'),
          600: v('red-600')
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'monospace']
      }
    }
  },
  plugins: []
};
