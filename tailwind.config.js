/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          inset: 'var(--surface-inset)',
          base: 'var(--surface-base)',
          raised: 'var(--surface-raised)',
          overlay: 'var(--surface-overlay)',
          hover: 'var(--surface-hover)',
          glass: 'var(--surface-glass)',
        },
        ink: {
          primary: 'var(--ink-primary)',
          secondary: 'var(--ink-secondary)',
          muted: 'var(--ink-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          muted: 'var(--accent-muted)',
        },
        gain: {
          DEFAULT: 'var(--gain)',
          muted: 'var(--gain-muted)',
        },
        loss: {
          DEFAULT: 'var(--loss)',
          muted: 'var(--loss-muted)',
        },
        gold: 'var(--gold)',
        border: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
          glass: 'var(--surface-glass-border)',
        },
        chart: {
          grid: 'var(--chart-grid)',
          tick: 'var(--chart-tick)',
        },
      },
      borderColor: {
        DEFAULT: 'var(--border-default)',
        subtle: 'var(--border-subtle)',
        strong: 'var(--border-strong)',
        glass: 'var(--surface-glass-border)',
      },
      ringColor: {
        accent: 'var(--ring-accent)',
      },
      backgroundImage: {
        'gradient-surface': 'var(--gradient-surface)',
        'gradient-accent': 'var(--gradient-accent)',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Space Grotesk"', '"DM Sans"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: [
          '2.25rem',
          { lineHeight: '2.5rem', letterSpacing: '-0.03em', fontWeight: '700' },
        ],
        h1: ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.025em', fontWeight: '700' }],
        h2: ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.015em', fontWeight: '600' }],
        h3: ['1.0625rem', { lineHeight: '1.5rem', letterSpacing: '-0.01em', fontWeight: '600' }],
      },
      fontVariantNumeric: {
        tabular: 'tabular-nums',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-down': 'slideDown 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'scale-in': 'scaleIn 0.15s ease-out',
        shimmer: 'shimmer 1.6s infinite linear',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        sm: '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        md: '0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06)',
        lg: '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.06)',
        subtle: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        card: '0 2px 8px rgb(0 0 0 / 0.08), 0 1px 2px rgb(0 0 0 / 0.06)',
        elevated: '0 8px 24px rgb(0 0 0 / 0.14), 0 2px 8px rgb(0 0 0 / 0.08)',
        'glow-accent': 'var(--shadow-glow)',
        popover: '0 8px 30px rgb(0 0 0 / 0.12)',
      },
    },
  },
  plugins: [],
};
