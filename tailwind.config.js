/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: "#1A1A2E",
          navy: "#16213E",
          blue: "#0F3460",
          accent: "#E94560",
          "accent-light": "#FF6B81",
        },
      },
    },
  },
  plugins: [],
};
