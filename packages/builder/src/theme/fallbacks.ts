// Fallback fonts that match a Google font's size and line spacing, so the text does not move when
// the web font replaces the fallback (the layout shift of `font-display: swap`). Pure and client-safe.
//
// Each row: family, the system font it falls back to ('sans' = Arial, 'serif' = Times New Roman),
// then size-adjust, ascent-override, descent-override and line-gap-override in percent. Same values
// and method as `next/font`: the font's average letter width over the system font's, and its line
// metrics divided by that ratio. Only popular families are listed. Any other family keeps the plain
// generic fallback (`sans-serif`, `serif`). To add a family, take its metrics from `@capsizecss/metrics`.
const ROWS: [string, 'sans' | 'serif', number, number, number, number][] = [
  ['Inter', 'sans', 107.12, 90.44, 22.52, 0],
  ['Roboto', 'sans', 99.78, 92.98, 24.47, 0],
  ['Open Sans', 'sans', 105.15, 101.65, 27.86, 0],
  ['Lato', 'sans', 97.69, 101.03, 21.8, 0],
  ['Montserrat', 'sans', 112.83, 85.79, 22.25, 0],
  ['Poppins', 'sans', 112.16, 93.62, 31.21, 8.92],
  ['Source Sans 3', 'sans', 93.76, 109.21, 42.66, 0],
  ['Roboto Condensed', 'sans', 88.83, 104.44, 27.48, 0],
  ['Oswald', 'sans', 81.43, 146.51, 35.49, 0],
  ['Raleway', 'sans', 103.86, 90.51, 22.53, 0],
  ['Noto Sans', 'sans', 106.33, 100.54, 27.56, 0],
  ['Nunito', 'sans', 101.39, 99.71, 34.82, 0],
  ['Nunito Sans', 'sans', 101.39, 99.71, 34.82, 0],
  ['Ubuntu', 'sans', 102.06, 91.32, 18.52, 2.74],
  ['Rubik', 'sans', 104.98, 89.06, 23.81, 0],
  ['Playfair Display', 'serif', 111.26, 97.25, 22.56, 0],
  ['Merriweather', 'serif', 122.09, 80.59, 22.36, 0],
  ['PT Sans', 'sans', 96.68, 105.3, 28.55, 0],
  ['PT Serif', 'serif', 110.28, 94.22, 25.93, 0],
  ['Work Sans', 'sans', 111.93, 83.09, 21.71, 0],
  ['Mulish', 'sans', 104.08, 96.56, 24.02, 0],
  ['Kanit', 'sans', 101.39, 108.49, 38.96, 0],
  ['Fira Sans', 'sans', 102.74, 91.01, 25.79, 0],
  ['DM Sans', 'sans', 104.53, 94.9, 29.66, 0],
  ['DM Serif Display', 'serif', 109.78, 94.37, 30.51, 0],
  ['DM Serif Text', 'serif', 109.29, 94.79, 30.65, 0],
  ['Quicksand', 'sans', 104.31, 95.87, 23.97, 0],
  ['Barlow', 'sans', 96.68, 103.43, 20.69, 0],
  ['IBM Plex Sans', 'sans', 101.17, 101.32, 27.18, 0],
  ['IBM Plex Serif', 'serif', 116.43, 88.04, 23.62, 0],
  ['Manrope', 'sans', 103.19, 103.31, 29.07, 0],
  ['Karla', 'sans', 102.4, 89.55, 24.61, 0],
  ['Libre Baskerville', 'serif', 127.26, 76.22, 21.22, 0],
  ['Lora', 'serif', 115.2, 87.33, 23.78, 0],
  ['Cabin', 'sans', 94.66, 101.94, 26.41, 0],
  ['Josefin Sans', 'sans', 102.29, 73.32, 24.44, 0],
  ['Archivo', 'sans', 98.7, 88.96, 21.28, 0],
  ['Space Grotesk', 'sans', 109.69, 89.71, 26.62, 0],
  ['Plus Jakarta Sans', 'sans', 104.98, 98.88, 21.15, 0],
  ['Outfit', 'sans', 99.82, 100.18, 26.05, 0],
  ['Sora', 'sans', 113.73, 85.29, 25.5, 0],
  ['Figtree', 'sans', 100.72, 94.32, 24.82, 0],
  ['Lexend', 'sans', 109.91, 90.98, 22.74, 0],
  ['Urbanist', 'sans', 99.04, 95.93, 25.24, 0],
  ['Albert Sans', 'sans', 103.86, 91.47, 24.07, 0],
  ['Public Sans', 'sans', 104.87, 90.59, 21.46, 0],
  ['Hanken Grotesk', 'sans', 100.94, 99.07, 30.02, 0],
  ['Newsreader', 'serif', 105.48, 69.68, 25.12, 0],
  ['Fraunces', 'serif', 115.45, 84.71, 22.09, 0],
  ['Cormorant Garamond', 'serif', 96.98, 95.27, 29.59, 0],
  ['Crimson Text', 'serif', 97.36, 97.5, 36.01, 0],
  ['Crimson Pro', 'serif', 98.56, 90.96, 21.8, 0],
  ['EB Garamond', 'serif', 94.77, 106.26, 31.44, 0],
  ['Bitter', 'serif', 114.46, 81.69, 23.15, 0],
  ['Libre Franklin', 'sans', 104.31, 92.61, 23.58, 0],
  ['Heebo', 'sans', 99.89, 104.9, 42.14, 0],
  ['Assistant', 'sans', 92.87, 109.94, 30.9, 0],
  ['Arimo', 'sans', 100, 90.53, 21.19, 3.27],
  ['Titillium Web', 'sans', 94.44, 119.97, 41.09, 0],
  ['Source Serif 4', 'serif', 117.91, 87.87, 28.41, 0],
  ['Noto Serif', 'serif', 118.4, 90.29, 24.75, 0],
  ['Roboto Slab', 'serif', 116.83, 89.69, 23.2, 0],
  ['Zilla Slab', 'serif', 106.83, 88.36, 23.96, 0],
  ['Bebas Neue', 'sans', 76.72, 117.32, 39.11, 0],
  ['Anton', 'sans', 90.69, 129.7, 36.29, 0],
  ['Abril Fatface', 'sans', 103.41, 102.31, 28.14, 0],
  ['Cormorant', 'serif', 96.74, 95.52, 29.67, 0],
  ['Spectral', 'serif', 109.78, 96.46, 42.17, 0],
  ['Vollkorn', 'serif', 107.82, 88.3, 40.9, 0],
  ['Domine', 'serif', 119.38, 75.39, 20.1, 0],
  ['Arvo', 'serif', 120.19, 79.95, 20.56, 2.23],
  ['Be Vietnam Pro', 'sans', 110.36, 90.61, 24.01, 0],
  ['Onest', 'sans', 105.2, 92.2, 28.99, 0],
  ['Instrument Sans', 'sans', 102.74, 94.42, 24.33, 0],
  ['Instrument Serif', 'serif', 83.94, 117.94, 36.93, 0],
  ['Geist', 'sans', 104.76, 95.94, 28.16, 0],
  ['Bricolage Grotesque', 'sans', 105.43, 88.21, 25.61, 0],
  ['Epilogue', 'sans', 111.04, 71.15, 21.16, 0],
  ['Syne', 'sans', 98.47, 93.93, 27.93, 0],
  ['Jost', 'sans', 96.01, 111.45, 39.06, 0],
  ['Red Hat Display', 'sans', 99.15, 102.68, 30.76, 0],
  ['Red Hat Text', 'sans', 100.27, 101.53, 30.42, 0],
  ['Overpass', 'sans', 100.72, 87.67, 38.03, 0],
  ['Exo 2', 'sans', 102.06, 97.88, 19.69, 0],
  ['Maven Pro', 'sans', 103.63, 93.12, 20.26, 0],
  ['Catamaran', 'sans', 92.19, 119.31, 58.57, 0],
  ['Signika', 'sans', 95.89, 98.02, 30.45, 0],
  ['Asap', 'sans', 99.15, 94.2, 21.38, 0],
  ['Hind', 'sans', 96.23, 109.63, 56.74, 0],
  ['Oxygen', 'sans', 101.1, 101.57, 23.33, 0],
  ['Questrial', 'sans', 99.6, 82.33, 21.09, 0],
]

const SYSTEM_FONT = { sans: 'Arial', serif: 'Times New Roman' } as const

const BY_FAMILY = new Map(ROWS.map((row) => [row[0], row]))

/** The name of the fallback font face for a family: "Inter" gives "Inter Fallback". */
export const fallbackFamilyName = (family: string) => `${family} Fallback`

/** True when the table has metrics for the family. */
export const hasFallbackMetrics = (family: string) => BY_FAMILY.has(family)

/**
 * One `@font-face` rule for the fallback of a family, or `null` when the family is not in the table.
 * The face uses a system font scaled to the web font's size and line spacing.
 */
export function fallbackFontFace(family: string): string | null {
  const row = BY_FAMILY.get(family)
  if (!row) return null
  const [, kind, size, ascent, descent, lineGap] = row
  return (
    `@font-face { font-family: '${fallbackFamilyName(family)}'; src: local('${SYSTEM_FONT[kind]}'); ` +
    `size-adjust: ${size}%; ascent-override: ${ascent}%; descent-override: ${descent}%; line-gap-override: ${lineGap}%; }`
  )
}
