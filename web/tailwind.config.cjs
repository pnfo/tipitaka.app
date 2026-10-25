/** Tailwind 3.4 (v4 needs Safari 16.4+/Chrome 111+ which old WebViews lack). Colours are CSS variables
 * (src/styles/main.css) so themes switch without rebuilding classes. */
const v = (name) => `var(--c-${name})`
module.exports = {
  content: [__dirname + '/index.html', __dirname + '/src/**/*.{vue,ts}'],
  blocklist: ['sepia'], // the filter utility, not wanted (the sepia theme is the class theme-sepia)
  darkMode: ['variant', '.dark &'], // plain descendant selector (the default uses :is() which old WebViews lack)
  theme: {
    screens: { sm: '640px', md: '900px', lg: '1200px', xl: '1500px' },
    extend: {
      colors: {
        primary: v('primary'), 'primary-soft': v('primary-soft'), accent: v('accent'), bg: v('bg'), surface: v('surface'),
        surface2: v('surface2'), fg: v('fg'), muted: v('muted'), line: v('line'), highlight: v('highlight'), error: v('error'),
        mula: v('mula'), atta: v('atta'), tika: v('tika'), anya: v('anya'), link: v('link'),
      },
      fontFamily: { ui: ['var(--font-ui)'], text: ['var(--font-text)'] },
      maxWidth: { reading: 'var(--reading-width)' },
    },
  },
  // opacity utilities emit rgb(r g b / a) and css variables that old WebViews do not support
  corePlugins: { backgroundOpacity: false, textOpacity: false, borderOpacity: false, divideOpacity: false, placeholderOpacity: false, ringOpacity: false },
}
