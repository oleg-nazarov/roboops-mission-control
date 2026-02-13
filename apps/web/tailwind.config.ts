import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'hsl(var(--color-bg) / <alpha-value>)',
        surface: 'hsl(var(--color-surface) / <alpha-value>)',
        'surface-elevated': 'hsl(var(--color-surface-elevated) / <alpha-value>)',
        text: 'hsl(var(--color-text) / <alpha-value>)',
        muted: 'hsl(var(--color-muted) / <alpha-value>)',
        border: 'hsl(var(--color-border) / <alpha-value>)',
        accent: 'hsl(var(--color-accent) / <alpha-value>)',
        'accent-soft': 'hsl(var(--color-accent-soft) / <alpha-value>)',
        status: {
          idle: 'hsl(var(--status-idle) / <alpha-value>)',
          'on-mission': 'hsl(var(--status-on-mission) / <alpha-value>)',
          'need-assist': 'hsl(var(--status-need-assist) / <alpha-value>)',
          fault: 'hsl(var(--status-fault) / <alpha-value>)',
          offline: 'hsl(var(--status-offline) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
      },
      borderRadius: {
        panel: 'var(--radius-panel)',
        pill: 'var(--radius-pill)',
      },
      spacing: {
        shell: 'var(--space-shell-pad)',
        sidebar: 'var(--space-sidebar)',
      },
      boxShadow: {
        elevation: 'var(--shadow-elevation)',
      },
      keyframes: {
        shellIn: {
          '0%': { opacity: '0', transform: 'translateY(10px) scale(0.99)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.45' },
          '50%': { opacity: '0.9' },
        },
      },
      animation: {
        shellIn: 'shellIn var(--motion-normal) var(--ease-emphasis) both',
        pulseSoft: 'pulseSoft 2.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
