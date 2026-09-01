/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#f0f3f9",
          100: "#d9e0ef",
          200: "#b3c1df",
          300: "#8da2cf",
          400: "#6783bf",
          500: "#4164af",
          600: "#34508c",
          700: "#273c69",
          800: "#1a2846",
          900: "#0d1423",
          950: "#060a12",
        },
        risk: {
          low: "#22c55e",
          medium: "#f59e0b",
          high: "#ef4444",
          review: "#f59e0b",
        },
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
