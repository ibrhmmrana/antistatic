/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    // Explicitly include onboarding pages to prevent CSS purging
    './app/onboarding/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-roboto-stack)', 'system-ui', 'sans-serif'],
        'google-sans': ['var(--font-google-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

