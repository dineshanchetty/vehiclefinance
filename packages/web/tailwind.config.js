/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        wesbank: {
          navy: '#003478',
          'navy-dark': '#002553',
          'navy-darker': '#001A3D',
          yellow: '#FFC72C',
          'yellow-dark': '#E0AC1F',
          sky: '#0070BA',
        },
      },
    },
  },
  plugins: [],
}
