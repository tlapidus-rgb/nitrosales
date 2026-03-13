/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        nitro: {
          bg:      "#0A0A0A",
          bg2:     "#111111",
          card:    "#161616",
          border:  "#222222",
          orange:  "#FF5E1A",
          red:     "#FF2E2E",
          yellow:  "#FFB800",
          green:   "#4ADE80",
          err:     "#FF5E5E",
          text:    "#FFFFFF",
          text2:   "#8A8A8A",
          muted:   "#555555",
          hover:   "#1a1a1a",
        },
      },
      fontFamily: {
        sans:      ['DM Sans', 'system-ui', 'sans-serif'],
        headline:  ['Archivo Black', 'Impact', 'sans-serif'],
        mono:      ['Space Mono', 'monospace'],
      },
      borderRadius: {
        'nitro': '16px',
        'nitro-sm': '12px',
      },
      transitionTimingFunction: {
        'nitro': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      backgroundImage: {
        'nitro-gradient': 'linear-gradient(135deg, #FF5E1A 0%, #FF2E2E 50%, #FFB800 100%)',
      },
    },
  },
  plugins: [],
};
