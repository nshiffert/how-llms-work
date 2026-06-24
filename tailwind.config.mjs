/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Surfaces — deep, slightly blue near-black. Distill/Stripe-docs feel.
        ink: {
          900: '#070a10', // page background
          800: '#0b0f17', // base surface
          700: '#11161f', // raised surface / cards
          600: '#161c27', // hover / inputs
          500: '#1d2531', // borders-strong
        },
        line: {
          DEFAULT: '#222a37', // hairline borders
          soft: '#1a212c',
        },
        fg: {
          DEFAULT: '#e7ebf2', // primary text
          muted: '#9aa6b8', // secondary text
          faint: '#6b7689', // captions, labels
        },
        // Primary accent — technical blue. Interactive / links.
        accent: {
          DEFAULT: '#6ea8fe',
          hover: '#8cbcff',
          dim: '#3b5a8a',
        },
        // "Live data" highlight — teal. Used for active values in viz.
        live: {
          DEFAULT: '#5eead4',
          dim: '#2f7d70',
        },
        // Category accents for the topic grid.
        cat: {
          basics: '#6ea8fe', // blue
          finetune: '#b692f6', // violet
          generation: '#f5a85e', // amber
          advanced: '#5ee3a1', // emerald
          math: '#f57e9c', // rose
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      maxWidth: {
        prose: '46rem', // reading column
        wide: '72rem', // viz / grid column
      },
      borderRadius: {
        xl2: '14px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(110,168,254,0.35)' },
          '100%': { boxShadow: '0 0 0 10px rgba(110,168,254,0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
        'pulse-ring': 'pulse-ring 1.4s ease-out infinite',
      },
    },
  },
  plugins: [],
};
