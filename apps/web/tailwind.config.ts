/** @type {import('tailwindcss').Config} */
const config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f4f6f8",
          100: "#e6ebf0",
          200: "#cdd6e0",
          300: "#a8b7c7",
          400: "#7d93aa",
          500: "#5f778f",
          600: "#4a5f75",
          700: "#3d4e60",
          800: "#354351",
          900: "#2f3a46",
          950: "#1a222b",
        },
        signal: {
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(26, 34, 43, 0.06), 0 8px 24px rgba(26, 34, 43, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
