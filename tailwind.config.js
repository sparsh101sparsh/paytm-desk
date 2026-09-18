/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ros: {
          navy: "#002970",
          indigo: "#3730A3",
          "indigo-soft": "#EEF2FF",
          page: "#F5F7FB",
          surface: "#FFFFFF",
          border: "#E6EAF0",
          text: "#1B1F3B",
          muted: "#6B7289",
          green: "#10B981",
          "green-soft": "#D1FAE5",
          amber: "#92400E",
          "amber-soft": "#FFF4E0",
          red: "#991B1B",
          "red-soft": "#FEE2E2",
        },
      },
      fontFamily: {
        sans: ["Lexend", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      boxShadow: {
        sm: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
      },
    },
  },
  plugins: [],
};
