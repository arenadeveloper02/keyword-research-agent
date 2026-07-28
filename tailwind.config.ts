import type { Config } from 'tailwindcss';

// Arena Design System theme.
// The app's existing utility classes (indigo/slate/emerald/rose/amber) are remapped
// to Arena DS semantic palettes so the whole UI adopts the Arena look without
// touching individual components:
// - indigo  -> Arena Brand Blue (base 600 = #1A73E8)
// - slate   -> Arena Grey (900 #2C2D33 ... 50 #F7F8F9)
// - emerald -> Arena Success Green (600 #3BC884)
// - rose    -> Arena Error Red (600 #F31A1A)
// - amber   -> Arena Warning Orange (600 #FB8145)
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        indigo: {
          50: '#F3F8FE',
          100: '#E1EDFC',
          200: '#C3DBF9',
          300: '#97C0F4',
          400: '#5D9CEE',
          500: '#3585EB',
          600: '#1A73E8',
          700: '#155CBA',
          800: '#10458B',
          900: '#0A2E5D',
        },
        slate: {
          50: '#F7F8F9',
          100: '#EFF0F2',
          200: '#DFE1E5',
          300: '#C0C3CB',
          400: '#9EA2AE',
          500: '#858997',
          600: '#6D717F',
          700: '#575B66',
          800: '#41444D',
          900: '#2C2D33',
        },
        emerald: {
          50: '#EFFBF5',
          100: '#D8F4E6',
          200: '#B1E9CE',
          300: '#89DEB5',
          400: '#62D39D',
          500: '#4ECD90',
          600: '#3BC884',
          700: '#2FA06A',
          800: '#23784F',
          900: '#185035',
        },
        rose: {
          50: '#FEF2F2',
          100: '#FDDCDC',
          200: '#FBB9B9',
          300: '#F98D8D',
          400: '#F65C5C',
          500: '#F53B3B',
          600: '#F31A1A',
          700: '#C21515',
          800: '#921010',
          900: '#610A0A',
        },
        amber: {
          50: '#FFF4EE',
          100: '#FEE4D5',
          200: '#FDC9AB',
          300: '#FCAD81',
          400: '#FC9763',
          500: '#FB8C54',
          600: '#FB8145',
          700: '#C96737',
          800: '#974D29',
          900: '#64341C',
        },
      },
      boxShadow: {
        sm: '0 1px 2px rgba(44,45,51,0.08)',
        DEFAULT: '0 2px 8px rgba(44,45,51,0.10)',
        md: '0 2px 8px rgba(44,45,51,0.10)',
        lg: '0 4px 16px rgba(44,45,51,0.12)',
        xl: '0 8px 32px rgba(44,45,51,0.16)',
      },
    },
  },
  plugins: [],
};

export default config;
