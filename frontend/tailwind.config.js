/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        wa: {
          dark: '#075E54',
          medium: '#128C7E',
          light: '#25D366',
          bg: '#EFEAE2',
          sidebar: '#FFFFFF',
          chat: '#EFEAE2',
          input: '#F0F2F5',
          hover: '#F5F6F6',
          header: '#F0F2F5',
          bubble: {
            out: '#D9FDD3',
            in: '#FFFFFF',
          },
          note: '#FFF9C4',
          border: '#E9EDEF',
          text: '#111B21',
          textSecondary: '#667781',
        }
      },
      fontFamily: {
        rubik: ['Rubik', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
