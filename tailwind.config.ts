import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        obsidian: '#0B1114',
        baize: {
          DEFAULT: '#10231D',
          deep: '#0A1713',
          light: '#163028',
        },
        ivory: {
          DEFAULT: '#F7F4EB',
          bright: '#FFFDF9',
          edge: '#D5CEBC',
          recess: '#EAE4D3',
        },
        brass: {
          DEFAULT: '#D4AF37',
          light: '#E6C65A',
          muted: '#8F7524',
        },
        tile: {
          red: '#D92D20',
          blue: '#155EEF',
          yellow: '#B86E00',
          black: '#18181B',
        },
      },
      boxShadow: {
        tile: '0 3px 0 #C8C0AC, 0 5px 10px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
        'tile-selected': '0 4px 0 #D4AF37, 0 8px 18px rgba(212, 175, 55, 0.45), inset 0 1px 0 rgba(255, 255, 255, 1)',
        'tile-dragging': '0 14px 28px rgba(0, 0, 0, 0.6), 0 4px 0 #C8C0AC',
        tray: 'inset 0 2px 6px rgba(0, 0, 0, 0.55), 0 1px 0 rgba(255, 255, 255, 0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
