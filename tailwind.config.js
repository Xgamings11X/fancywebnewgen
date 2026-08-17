/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: { extend: {} },
  plugins: [],
  // Nonaktifkan preflight agar tidak bentrok dengan CSS custom dari design user
  corePlugins: { preflight: false },
}
