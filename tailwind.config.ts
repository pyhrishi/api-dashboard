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
          DEFAULT: '#09090B',
          2: '#111115',
          3: '#18181B',
        },
        teal: {
          DEFAULT: '#46BDC6',
          ice: '#7AE2E9',
          deep: '#207C82',
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
        'stream-blink': 'stream-blink 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-node': 'pulse-node 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'liveness-scan': 'liveness-scan 3s ease-in-out infinite',
      },
      keyframes: {
        'stream-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.2' },
        },
        'pulse-node': {
          '0%': { transform: 'scale(0.95)', boxShadow: '0 0 0 0 rgba(70, 189, 198, 0.7)' },
          '70%': { transform: 'scale(1)', boxShadow: '0 0 0 10px rgba(70, 189, 198, 0)' },
          '100%': { transform: 'scale(0.95)', boxShadow: '0 0 0 0 rgba(70, 189, 198, 0)' },
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
