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
        // ── Design system "enterprise" (inspo AppStack, feedback Tomy) ──
        // Warm-neutral ("como Claude"), casi monocromo + 1 acento verde apagado
        // usado <2% (solo status). Ver design-appstack-enterprise.local.md.
        ink:      { DEFAULT: "#1C1B18", 60: "#6B685F", 40: "#9A978D" },
        canvas:   "#FBFAF7",
        surface:  { DEFAULT: "#F5F3EE", 2: "#EDEAE3" },
        hairline: { DEFAULT: "#E5E1D8", 2: "#DCD8CD" },
        accent:   { DEFAULT: "#2F9153", soft: "#EAF2EC" },
        live:     { amber: "#C98A1A" },
      },
      fontFamily: {
        sans:      ['DM Sans', 'system-ui', 'sans-serif'],
        headline:  ['Archivo Black', 'Impact', 'sans-serif'],
        mono:      ['Space Mono', 'monospace'],
        // Geist (self-hosted vía next/font), scopeado a las rutas que lo aplican.
        geist:     ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        geistmono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        'nitro': '16px',
        'nitro-sm': '12px',
      },
      boxShadow: {
        'ent-xs':   '0 1px 2px rgba(28,27,24,.05)',
        'ent-soft': '0 10px 30px -10px rgba(28,27,24,.12)',
      },
      transitionTimingFunction: {
        'nitro': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'ent':   'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      keyframes: {
        livePulse: {
          '0%':   { transform: 'scale(1)',   opacity: '.5' },
          '100%': { transform: 'scale(2.3)', opacity: '0'  },
        },
      },
      animation: {
        'live-pulse': 'livePulse 2.4s cubic-bezier(.16,1,.3,1) infinite',
      },
      backgroundImage: {
        'nitro-gradient': 'linear-gradient(135deg, #FF5E1A 0%, #FF2E2E 50%, #FFB800 100%)',
      },
    },
  },
  plugins: [],
};
