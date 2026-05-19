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
        // App brand placeholders — tweak as needed
        brand: {
          DEFAULT: '#16a34a', // green-600
          dark: '#15803d',
          light: '#dcfce7',
        },
      },
    },
  },
  plugins: [],
};
