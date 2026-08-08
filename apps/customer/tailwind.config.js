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
      },
      fontFamily: {
        sans: ['system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 4px 15px rgba(47, 42, 38, 0.08)',
        'soft-lg': '0 8px 30px rgba(47, 42, 38, 0.12)',
      },
      borderRadius: {
        xl: '20px',
        '2xl': '24px',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-in',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
