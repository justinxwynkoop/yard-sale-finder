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
        // Primary brand — deeper, warmer forest. The "Open House" green.
        brand: {
          50: '#EEF4EF',
          100: '#DCEADE',
          200: '#B6D2BB',
          300: '#86B091',
          400: '#558F6B',
          DEFAULT: '#1F4D3A', // 500 — primary action
          500: '#1F4D3A',
          600: '#163828',
          700: '#0F2A1E',
          800: '#0A1F17',
          900: '#06150F',
          soft: '#E1ECDF',
          softer: '#EEF4EF',
        },

        // Warm surfaces.
        bone: '#F7F2E8',
        cream: '#EFE8D6',

        // Ink scale — slightly warm.
        ink: {
          DEFAULT: '#171513',
          900: '#171513',
          700: '#54504A',
          500: '#8A857C',
          300: '#C7C1B0',
          200: '#E5DECC',
          100: '#EFE8D6',
          50: '#F7F2E8',
        },
        hairline: '#E5DECC',

        // Status — new palette mapped to existing names.
        live: {
          DEFAULT: '#1F4D3A',
          bg: '#E1ECDF',
          fg: '#0F2A1E',
        },
        winding: {
          DEFAULT: '#B8772C',
          bg: '#FBEFD6',
          fg: '#6B4318',
        },
        ended: {
          DEFAULT: '#8A857C',
          bg: '#EFEBE0',
          fg: '#54504A',
        },

        // Accent for alerts / errors / "ending today" affordances.
        rose: {
          DEFAULT: '#A23E2D',
          bg: '#F5DDD7',
        },

        // App surface — kept as `surface` for migration safety; points at bone.
        surface: '#F7F2E8',
      },
      borderRadius: {
        '2xl': '20px',
        '3xl': '28px',
        '4xl': '32px',
      },
      fontSize: {
        '2xs': '10px',
      },
    },
  },
  plugins: [],
};
