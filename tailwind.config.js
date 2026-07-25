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
        subtle: 'var(--border-subtle)',
        strong: 'var(--border-strong)',
        neon: 'var(--border-neon)',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        sm: '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        md: '0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06)',
        lg: '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.06)',
        subtle: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        card: '0 2px 8px rgb(0 0 0 / 0.08), 0 1px 2px rgb(0 0 0 / 0.06)',
        elevated: '0 8px 24px rgb(0 0 0 / 0.14), 0 2px 8px rgb(0 0 0 / 0.08)',
        'glow-gold': '0 0 20px var(--neon-gold), 0 0 40px color-mix(in srgb, var(--neon-gold) 40%, transparent)',
        'glow-pink': '0 0 20px var(--neon-pink), 0 0 40px color-mix(in srgb, var(--neon-pink) 40%, transparent)',
        'glow-green': '0 0 20px var(--neon-green), 0 0 40px color-mix(in srgb, var(--neon-green) 40%, transparent)',
        'glow-amber': '0 0 20px var(--neon-amber), 0 0 40px color-mix(in srgb, var(--neon-amber) 40%, transparent)',
        popover: '0 8px 30px rgb(0 0 0 / 0.12)',
      },
      fontFamily: {
        sans: ['"Poppins"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Righteous"', '"Poppins"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: [
          'clamp(2.5rem,8vw,5rem)',
          { lineHeight: '1', letterSpacing: '-0.03em', fontWeight: '400' },
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
        'glitch-1': 'glitch1 0.3s ease-in-out',
        'glitch-2': 'glitch2 0.4s ease-in-out',
        'neon-pulse': 'neonPulse 2s ease-in-out infinite',
        'scanline': 'scanline 8s linear infinite',
        'chroma-shift': 'chromaShift 3s ease-in-out infinite',
        'marquee': 'marquee 30s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'float-reverse': 'floatReverse 7s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2.5s ease-in-out infinite',
        'perspective-enter': 'perspectiveEnter 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
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
        glitch1: {
          '0%, 100%': { transform: 'translate(0)' },
          '20%': { transform: 'translate(-2px, 1px) skewX(-1deg)' },
          '40%': { transform: 'translate(2px, -1px) skewX(1deg)' },
          '60%': { transform: 'translate(-1px, 2px)' },
          '80%': { transform: 'translate(1px, -1px) skewX(-0.5deg)' },
        },
        glitch2: {
          '0%, 100%': { transform: 'translate(0)' },
          '15%': { transform: 'translate(3px, -2px) skewX(2deg)' },
          '30%': { transform: 'translate(-3px, 1px) skewX(-2deg)' },
          '50%': { transform: 'translate(2px, 2px)' },
          '70%': { transform: 'translate(-2px, -1px) skewX(1deg)' },
          '90%': { transform: 'translate(1px, -2px) skewX(-1deg)' },
        },
        neonPulse: {
          '0%, 100%': { opacity: '1', filter: 'brightness(1)' },
          '50%': { opacity: '0.85', filter: 'brightness(1.3)' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        chromaShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
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
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 8px var(--ring-accent), 0 0 20px var(--shadow-glow)' },
          '50%': { boxShadow: '0 0 16px var(--ring-accent), 0 0 40px var(--shadow-glow)' },
        },
        perspectiveEnter: {
          '0%': { opacity: '0', transform: 'perspective(1200px) rotateX(8deg) translateY(60px) scale(0.95)' },
          '100%': { opacity: '1', transform: 'perspective(1200px) rotateX(0) translateY(0) scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
