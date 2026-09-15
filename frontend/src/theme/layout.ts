// Spacing and layout constants (§1.3). Base unit 4; card padding 14 / 16 / 20; scroller and grid gaps 12.
// Every tab view centres its content in a column of width Math.min(windowWidth, layout.contentMax).
export const layout = { gutter: 20, sectionGap: 28, headerToContent: 12, contentMax: 560, dockMax: 520 } as const;
