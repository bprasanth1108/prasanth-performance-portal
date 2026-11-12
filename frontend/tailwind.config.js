/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fff8eb',
          100: '#fde68a',
          500: '#219EBC',
          600: '#FB8500',
          700: '#e07600',
          900: '#023047',
        },
      },
    },
  },
  plugins: [],
};
