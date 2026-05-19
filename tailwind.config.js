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
        // Warm yard-sale orange — primary brand
        brand: {
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          DEFAULT: '#F97316', // 500
          500: '#F97316',
          600: '#EA580C',
          700: '#C2410C',
          800: '#9A3412',
          900: '#7C2D12',
        },
        // Status palette
        live: {
          DEFAULT: '#10B981', // emerald-500
          bg: '#D1FAE5',
          fg: '#065F46',
        },
        winding: {
          DEFAULT: '#F59E0B', // amber-500
          bg: '#FEF3C7',
          fg: '#92400E',
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
