/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paytm: {
          navy: "#002970",
          navy2: "#002E6E",
          cyan: "#00BAF2",
          "cyan-hover": "#00A8DC",
          "cyan-soft": "#E6F8FE",
          page: "#F5F7FB",
          surface: "#FFFFFF",
          border: "#E6EAF0",
          text: "#1B1F3B",
          muted: "#6B7289",
          success: "#14804A",
          "success-soft": "#E7F6EE",
          warn: "#C47B00",
          "warn-soft": "#FFF4E0",
          danger: "#D32F2F",
          "danger-soft": "#FDECEC",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "12px",
        sm: "8px",
        xl: "12px",
      },
      boxShadow: {
        paytm: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
      }
    },
  },
  plugins: [],
};
