/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        text: "var(--text)",
        "text-2": "var(--text-2)",
        "text-3": "var(--text-3)",
        accent: "var(--accent)",
        "accent-glow": "var(--accent-glow)",
        "accent-2": "var(--accent-2)",
        "accent-2-glow": "var(--accent-2-glow)",
        red: "var(--red)",
        "red-glow": "var(--red-glow)",
        orange: "var(--orange)",
        yellow: "var(--yellow)",
      },
      fontFamily: {
        display: "var(--font-display)",
        body: "var(--font-body)",
        mono: "var(--font-mono)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "var(--radius-sm)",
        xl: "20px",
        "2xl": "24px",
      },
      spacing: {
        "header-h": "60px",
      },
      boxShadow: {
        premium: "0 20px 50px rgba(0, 0, 0, 0.05)",
        "premium-dark": "0 20px 50px rgba(0, 0, 0, 0.25)",
        glow: "0 0 20px var(--accent-glow)",
      },
      transitionProperty: {
        'all-smooth': 'all',
      },
      transitionDuration: {
        '400': '400ms',
      },
      animation: {
        'shimmer': 'shimmer 1.6s ease-in-out infinite',
        'pulseDot': 'pulseDot 2s ease-in-out infinite',
        'fadeUp': 'fadeUp 0.5s ease both',
        'fadeIn': 'fadeIn 0.2s ease both',
        'slideUp': 'slideUp 0.25s ease both',
        'dashFlow': 'dashFlow 1.5s linear infinite',
        'countUp': 'countUp 2s ease both',
        'slideIn': 'slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) both',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.4', transform: 'scale(0.8)' },
        },
        fadeUp: {
          'from': { opacity: '0', transform: 'translateY(12px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          'from': { opacity: '0' },
          'to': { opacity: '1' },
        },
        slideUp: {
          'from': { opacity: '0', transform: 'translateY(20px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
        dashFlow: {
          'from': { strokeDashoffset: '20' },
          'to': { strokeDashoffset: '0' },
        },
        countUp: {
          'from': { opacity: '0', transform: 'translateY(6px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          'from': { transform: 'translateX(100%)', opacity: '0' },
          'to': { transform: 'translateX(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
