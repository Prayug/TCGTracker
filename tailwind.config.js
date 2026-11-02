/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
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
        gold: {
          DEFAULT: 'var(--gold)',
          muted: 'var(--gold-muted)',
          line: 'var(--gold-line)',
        },
        warn: {
          DEFAULT: 'var(--warn)',
          muted: 'var(--warn-muted)',
        },
        rule: {
          DEFAULT: 'var(--rule)',
          strong: 'var(--rule-strong)',
        },
      },
      borderRadius: {
        // Compressed scale: the old UI was 16px everywhere. Controls 6px,
        // sheets 8–10px, nothing pill-shaped unless it is a filter token.
        none: '0',
        sm: '3px',
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
        xl: '9px',
        '2xl': '10px',
        '3xl': '12px',
        full: '9999px',
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
        xs: '0 1px 2px 0 rgb(var(--shadow-color) / 0.04)',
        sm: '0 1px 3px 0 rgb(var(--shadow-color) / 0.08), 0 1px 2px -1px rgb(var(--shadow-color) / 0.06)',
        md: '0 4px 6px -1px rgb(var(--shadow-color) / 0.12), 0 2px 4px -2px rgb(var(--shadow-color) / 0.08)',
        lg: '0 10px 15px -3px rgb(var(--shadow-color) / 0.16), 0 4px 6px -4px rgb(var(--shadow-color) / 0.1)',
        subtle: '0 1px 2px 0 rgb(var(--shadow-color) / 0.04)',
        card: '0 2px 8px rgb(var(--shadow-color) / 0.2), 0 1px 2px rgb(var(--shadow-color) / 0.12)',
        elevated:
          '0 12px 32px rgb(var(--shadow-color) / 0.28), 0 2px 8px rgb(var(--shadow-color) / 0.12)',
        'glow-gold': '0 1px 2px rgb(var(--shadow-color) / 0.08)',
        'glow-pink': '0 1px 2px rgb(var(--shadow-color) / 0.08)',
        'glow-green': '0 1px 2px rgb(var(--shadow-color) / 0.08)',
        'glow-amber': '0 1px 2px rgb(var(--shadow-color) / 0.08)',
        'glow-foil': '0 1px 2px rgb(var(--shadow-color) / 0.08)',
        'glow-accent': '0 1px 2px rgb(var(--shadow-color) / 0.08)',
        popover: '0 1px 2px rgb(var(--shadow-color) / 0.08), 0 12px 32px -8px rgb(var(--shadow-color) / 0.3)',
        'card-art': 'var(--card-shadow)',
      },
      transitionTimingFunction: {
        // Emil Kowalski's curves: strong ease-out for UI, ease-in-out for on-screen moves.
        out: 'cubic-bezier(0.23, 1, 0.32, 1)',
        'in-out': 'cubic-bezier(0.77, 0, 0.175, 1)',
        drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        display: ['"Newsreader Variable"', '"Newsreader"', 'Georgia', 'serif'],
      },
      fontSize: {
        display: [
          'clamp(2rem,4.2vw,2.75rem)',
          { lineHeight: '1.08', letterSpacing: '-0.015em', fontWeight: '500' },
        ],
        h1: ['clamp(1.5rem,2.6vw,1.875rem)', { lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: '500' }],
        h2: ['1.0625rem', { lineHeight: '1.3', letterSpacing: '-0.005em', fontWeight: '600' }],
        h3: ['0.875rem', { lineHeight: '1.4', fontWeight: '600' }],
        meta: ['0.78125rem', { lineHeight: '1.4' }],
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
