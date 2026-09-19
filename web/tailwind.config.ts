import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/pages/**/*.{js,ts,jsx,tsx,mdx}", "./src/components/**/*.{js,ts,jsx,tsx,mdx}", "./src/app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
        },
        gray: {
          50: "rgb(var(--gray-50) / <alpha-value>)",
          100: "rgb(var(--gray-100) / <alpha-value>)",
          200: "rgb(var(--gray-200) / <alpha-value>)",
          300: "rgb(var(--gray-300) / <alpha-value>)",
          400: "rgb(var(--gray-400) / <alpha-value>)",
          500: "rgb(var(--gray-500) / <alpha-value>)",
          600: "rgb(var(--gray-600) / <alpha-value>)",
          700: "rgb(var(--gray-700) / <alpha-value>)",
          800: "rgb(var(--gray-800) / <alpha-value>)",
          900: "rgb(var(--gray-900) / <alpha-value>)",
        },
        ink: {
          700: "rgb(var(--ink-700) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          900: "rgb(var(--ink-900) / <alpha-value>)",
        },
        page: "rgb(var(--bg) / <alpha-value>)",
      },
      fontFamily: {
        sans: [
          '"Pretendard Variable"',
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Apple SD Gothic Neo"',
          '"Noto Sans KR"',
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
      },
      letterSpacing: {
        display: "-0.035em",
        heading: "-0.025em",
      },
      boxShadow: {
        // A hairline plus two soft layers reads crisper than one blurry drop shadow.
        card: "0 0 0 1px rgba(25, 31, 40, 0.04), 0 1px 2px rgba(25, 31, 40, 0.04), 0 8px 24px -6px rgba(25, 31, 40, 0.06)",
        raised: "0 0 0 1px rgba(25, 31, 40, 0.05), 0 2px 4px rgba(25, 31, 40, 0.05), 0 16px 36px -8px rgba(25, 31, 40, 0.12)",
        pop: "0 0 0 1px rgba(25, 31, 40, 0.06), 0 12px 32px rgba(25, 31, 40, 0.16)",
        ink: "0 1px 2px rgba(12, 26, 31, 0.3), 0 18px 40px -12px rgba(12, 26, 31, 0.45)",
        cta: "inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 1px 2px rgba(0, 119, 106, 0.35), 0 10px 24px -8px rgba(0, 161, 142, 0.55)",
        "cta-sm": "inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 1px 2px rgba(0, 119, 106, 0.3)",
      },
      borderRadius: {
        "2xl": "20px",
        "3xl": "24px",
        "4xl": "28px",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
        spring: "cubic-bezier(0.34, 1.4, 0.64, 1)",
      },
      animation: {
        "fade-up": "fade-up 0.55s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 0.25s ease-out both",
        "scale-in": "scale-in 0.4s cubic-bezier(0.34, 1.4, 0.64, 1) both",
        "sheet-up": "sheet-up 0.45s cubic-bezier(0.16, 1, 0.3, 1) both",
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.2, 0.6, 0.4, 1) infinite",
      },
    },
  },
  plugins: [],
};
export default config;
