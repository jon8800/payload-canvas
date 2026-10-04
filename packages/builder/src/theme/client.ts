'use client'
// Theme admin components (import map paths used by the theme global):
//   '@payload-toolkit/builder/theme-client#ThemeColorField'  — hex color with a picker
//   '@payload-toolkit/builder/theme-client#ThemeFontField'   — Google Font family with previews
//   '@payload-toolkit/builder/theme-client#ThemeSliderField' — slider plus number input (number or text field)
//   '@payload-toolkit/builder/theme-client#ThemeSaveSignal'  — tells open canvases that the theme changed
// The fields work in any Payload config, not only in the theme global.
export { ThemeColorField } from './admin/ColorField'
export { ThemeFontField } from './admin/FontField'
export { ThemeSliderField } from './admin/SliderField'
export { ThemeSaveSignal } from './admin/SaveSignal'
