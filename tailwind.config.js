/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        destructive: 'var(--destructive)',
        ring: 'var(--ring)',
        surface: {
          inset: 'var(--surface-inset)',
          base: 'var(--surface-base)',
          raised: 'var(--surface-raised)',
          overlay: 'var(--surface-overlay)',
          hover: 'var(--surface-hover)',
          chrome: 'var(--surface-chrome)',
        },
        ink: {
          primary: 'var(--ink-primary)',
          secondary: 'var(--ink-secondary)',
          muted: 'var(--ink-muted)',
        },
        neon: {
          gold: 'var(--neon-gold)',
          amber: 'var(--neon-amber)',
          pink: 'var(--neon-pink)',
          green: 'var(--neon-green)',
          cyan: 'var(--neon-cyan)',
        },
        foil: {
          DEFAULT: 'var(--foil)',
          muted: 'var(--foil-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          muted: 'var(--accent-muted)',
          foreground: 'var(--accent-foreground)',
        },
        gain: {
          DEFAULT: 'var(--gain)',
          muted: 'var(--gain-muted)',
        },
        loss: {
          DEFAULT: 'var(--loss)',
          muted: 'var(--loss-muted)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
          neon: 'var(--border-neon)',
        },
        chart: {
          grid: 'var(--chart-grid)',
          tick: 'var(--chart-tick)',
        },
      },
      borderColor: {
        DEFAULT: 'var(--border-default)',
        border: 'var(--border)',
        subtle: 'var(--border-subtle)',
        strong: 'var(--border-strong)',
        neon: 'var(--border-neon)',
        input: 'var(--input)',
      },
      outlineColor: {
        ring: 'var(--ring)',
      },
      ringColor: {
        DEFAULT: 'var(--ring)',
        ring: 'var(--ring)',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        sm: '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        md: '0 4px 6px -1px rgb(0 0 0 / 0.12), 0 2px 4px -2px rgb(0 0 0 / 0.08)',
        lg: '0 10px 15px -3px rgb(0 0 0 / 0.16), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        subtle: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        card: '0 2px 8px rgb(0 0 0 / 0.2), 0 1px 2px rgb(0 0 0 / 0.12)',
        elevated: '0 12px 32px rgb(0 0 0 / 0.28), 0 2px 8px rgb(0 0 0 / 0.12)',
        'glow-gold': '0 8px 24px color-mix(in srgb, var(--accent) 22%, transparent)',
        'glow-pink': '0 8px 24px color-mix(in srgb, var(--neon-pink) 18%, transparent)',
        'glow-green': '0 8px 24px color-mix(in srgb, var(--neon-green) 18%, transparent)',
        'glow-amber': '0 8px 24px color-mix(in srgb, var(--neon-amber) 18%, transparent)',
        'glow-foil': '0 8px 28px color-mix(in srgb, var(--foil) 22%, transparent)',
        'glow-accent': '0 8px 28px color-mix(in srgb, var(--accent) 24%, transparent)',
        popover: '0 8px 30px rgb(0 0 0 / 0.28)',
      },
      fontFamily: {
        sans: ['"Jost"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Outfit"', '"Jost"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: [
          'clamp(2.5rem,8vw,5rem)',
          { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '600' },
        ],
        h1: ['clamp(1.75rem,4vw,2.75rem)', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' }],
        h2: ['clamp(1.375rem,3vw,2rem)', { lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: '600' }],
        h3: ['1.0625rem', { lineHeight: '1.5', letterSpacing: '-0.01em', fontWeight: '600' }],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-down': 'slideDown 0.25s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        shimmer: 'shimmer 1.6s infinite linear',
        'marquee': 'marquee 30s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'float-reverse': 'floatReverse 7s ease-in-out infinite',
        'perspective-enter': 'perspectiveEnter 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'hero-float': 'heroFloat 5.5s ease-in-out infinite',
        'hero-float-slow': 'heroFloat 7s ease-in-out infinite',
        'hero-float-delay': 'heroFloat 6.2s ease-in-out 0.8s infinite',
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
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        floatReverse: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(12px)' },
        },
        perspectiveEnter: {
          '0%': { opacity: '0', transform: 'perspective(1200px) rotateX(8deg) translateY(60px) scale(0.95)' },
          '100%': { opacity: '1', transform: 'perspective(1200px) rotateX(0) translateY(0) scale(1)' },
        },
        heroFloat: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
};
