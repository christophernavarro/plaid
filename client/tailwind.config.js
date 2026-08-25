/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2f6',
          100: '#dbe5ef',
          200: '#b8cce0',
          300: '#8fafc8',
          400: '#5b8baa',
          500: '#2b5578',
          600: '#1f3a52',
          700: '#162b3d',
          800: '#0f1e2b',
          900: '#091319',
        },
        pos: '#2f6d4f',
        neg: '#b0553f',
      },
      fontFamily: {
        serif: ['Newsreader', 'Georgia', 'serif'],
        sans: ['Archivo', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
