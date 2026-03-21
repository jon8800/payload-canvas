/**
 * Generate a static JSON file of Google Font family names from google-font-metadata.
 * Run: pnpm generate:fonts (from apps/starter)
 */
import { writeFileSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

function main() {
  // Resolve the google-font-metadata data file directly
  const metadataPath = require.resolve('google-font-metadata/data/google-fonts-v2.json')
  const data: Record<string, { family: string }> = JSON.parse(
    readFileSync(metadataPath, 'utf8'),
  )

  // Extract font family names sorted alphabetically
  const families = Object.values(data)
    .map((font) => font.family)
    .sort((a, b) => a.localeCompare(b))

  const outputPath = resolve(__dirname, '../src/data/google-fonts.json')
  writeFileSync(outputPath, JSON.stringify(families, null, 0))

  console.log(`Generated ${families.length} font families to ${outputPath}`)
}

main()
