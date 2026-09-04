import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        ink: {
          DEFAULT: 'var(--color-surface)',
          2: 'var(--color-surface-2)',
          3: 'var(--color-surface-3)',
          4: 'var(--color-surface-4)',
        },
        // Semantic surface aliases
        surface:   'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
        'surface-3': 'var(--color-surface-3)',
        // Semantic text aliases
        fg:        'var(--color-fg)',
        'fg-muted':  'var(--color-fg-muted)',
        'fg-subtle': 'var(--color-fg-subtle)',
        // Semantic border aliases
        border: {
          DEFAULT: 'var(--color-border)',
          subtle: 'var(--color-border-subtle)',
          strong: 'var(--color-border-strong)',
        },
        // Glass / overlay
        glass:   'var(--color-glass)',
        'glass-2': 'var(--color-glass-2)',
        overlay: 'var(--color-overlay)',
        teal: {
          DEFAULT: 'var(--color-brand, #46BDC6)',
          ice: 'var(--color-brand-ice, #7AE2E9)',
          deep: 'var(--color-brand-deep, #207C82)',
        },
        mist: '#F3F4F6',
        neutral: {
          50: '#FFFFFF',
          100: '#F9FAFB',
          200: '#F7F7F7',
          300: '#F2F2F2',
          400: '#E5E7EB',
          500: '#BABAC4',
          600: '#888892',
          700: '#6F6F79',
          800: '#3E3D47',
          900: '#1D1C39',
        },
        semantic: {
          success: '#1D9E75',
          warning: '#C47B0A',
          error: '#DD1B24',
        }
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out forwards",
        "pulse-node": "pulse-node 2s infinite ease-in-out",
        "glitch": "glitch 0.2s infinite ease-in-out",
        'stream-blink': 'stream-blink 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'liveness-scan': 'liveness-scan 3s ease-in-out infinite',
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-node": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.8", transform: "scale(0.95)" },
        },
        "glitch": {
          "0%, 100%": { transform: "translate(0)" },
          "20%": { transform: "translate(-2px, 2px)" },
          "40%": { transform: "translate(-2px, -2px)" },
          "60%": { transform: "translate(2px, 2px)" },
          "80%": { transform: "translate(2px, -2px)" },
        },
        'stream-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.2' },
        },
        'liveness-scan': {
          '0%, 100%': { transform: 'translateY(-10px)' },
          '50%': { transform: 'translateY(10px)' },
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
export default config;
