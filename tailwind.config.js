/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.tsx',
    './index.ts',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Forest-green primary, paired with warm cream backgrounds.
        // 500 is the on-screen action color (buttons, pins, active
        // states). 600/700 match the logo wordmark for emphasis.
        brand: {
          50: '#EFF5EF',
          100: '#D6E5D9',
          200: '#ADCAB3',
          300: '#83AE8C',
          400: '#5A9265',
          DEFAULT: '#2D5F3E', // 500
          500: '#2D5F3E',
          600: '#234D24',
          700: '#1A3A1B',
          800: '#102810',
          900: '#08160A',
        },
        // Warm cream — the other half of the brand palette. Lives
        // in surfaces / chip backgrounds / splash. Keeps the
        // "vintage shop" warmth the logo establishes.
        cream: {
          DEFAULT: '#FFEDD5',
          50: '#FFF7ED',
          100: '#FFEDD5',
        },
        // Status palette
        live: {
          DEFAULT: '#10B981', // emerald-500
          bg: '#D1FAE5',
          fg: '#065F46',
        },
        winding: {
          DEFAULT: '#EAB308', // yellow-500 — clearly yellow, not orange
          bg: '#FEF9C3',
          fg: '#854D0E',
        },
        ended: {
          DEFAULT: '#9CA3AF',
          bg: '#F3F4F6',
          fg: '#6B7280',
        },
        // App surface
        surface: '#FAFAF9', // zinc-50 / warm
      },
      borderRadius: {
        '4xl': '32px',
      },
      fontSize: {
        '2xs': '10px',
      },
    },
  },
  plugins: [],
};
