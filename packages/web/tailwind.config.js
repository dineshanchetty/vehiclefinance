/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Claimtec official brand tokens (claimtec.co.za)
        claimtec: {
          forest:       '#0F1C17',  // primary (replaces WesBank navy)
          'forest-2':   '#16261F',  // hover / mid surface
          'forest-3':   '#1D3329',  // border / pill
          ink:          '#0A1410',  // deepest text/bg
          paper:        '#F4F6F3',  // light surface
          text:         '#F4F6F3',  // primary text on dark
          'text-dim':   '#B8C4BE',  // sub-headings
          'text-dimmer':'#7A8C84',  // meta
          red:          '#C8423A',  // primary accent — Logo "Tec" + primary buttons
          'red-2':      '#E05148',  // emphasis / hover
          gold:         '#C9A96A',  // decorative accent (badges, pills)
          sage:         '#5A7068',  // tertiary muted accent
          'blue-dot':   '#2DA7E6',  // logo dot only
        },
      },
    },
  },
  plugins: [],
}
