/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: '#F7F2EA',
        sand: '#E6D6BF',
        clay: '#C58C5B',
        terracotta: '#A85D35',
        charcoal: '#2F2A26',
        kilnpink: '#E85D8A',
        kilnpinkdark: '#C23F6B',
      },
      fontFamily: {
        sans: ['system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
