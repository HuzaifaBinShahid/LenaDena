// Themed colours resolve through CSS variables defined in global.css (`:root` = light,
// `.dark:root` = dark), so every className switches with the app's appearance. The
// values mirror src/theme/palettes.ts. Brand accents that never change are plain hex.
const themed = (name) => `rgb(var(--ld-${name}) / <alpha-value>)`;

module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ink: themed("ink"),
        "ink-soft": themed("ink-soft"),
        plum: themed("plum"),
        canvas: themed("canvas"),
        raised: themed("raised"),
        surface: themed("surface"),
        violet: themed("violet"),
        "violet-strong": "#4B2AA4",
        "violet-soft": themed("violet-soft"),
        lavender: "#B5A5FF",
        "lavender-soft": themed("lavender-soft"),
        lime: "#A9F0D6",
        "lime-soft": themed("lime-soft"),
        mint: themed("mint"),
        "mint-soft": themed("mint-soft"),
        coral: themed("coral"),
        "coral-soft": themed("coral-soft"),
        gold: themed("gold"),
        "gold-soft": themed("gold-soft"),
        slate: themed("slate"),
        muted: themed("muted"),
        line: themed("line"),
        // Always-dark brand night (auth, lock, splash, loading gates).
        night: "#0D0720",
      },
      borderRadius: {
        card: "20px",
      },
    },
  },
  plugins: [],
};
