import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Config } from 'payload'

import { applyFontFamilies, resolveFontValue } from '../css'
import { websiteBuilder } from '../plugin'
import { deriveColors, hexToOklch, hexToOklchValue, parseHex } from './colors'
import { THEME_CONFIG_KEY, themeConfigOf } from './config'
import { cleanFamily, googleFontsHref, themeCss, themeFontFamilies, themeOutput, themeVariables } from './css'

const close = (actual: number, expected: number, epsilon = 1e-3) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} is not close to ${expected}`)

/** The demo theme (seed-demo.ts). */
const DEMO = {
  colors: {
    primary: '#1f4536',
    secondary: '#ebe5da',
    accent: '#e4dccd',
    muted: '#ece6db',
    destructive: '#b42318',
    background: '#f6f3ec',
    foreground: '#1c1b18',
  },
  fonts: { sans: 'Hanken Grotesk', heading: 'Newsreader' },
  borderRadius: '0.5',
}

describe('theme colors', () => {
  it('parses hex colors and rejects anything else', () => {
    assert.deepEqual(parseHex('#fff'), [1, 1, 1])
    assert.deepEqual(parseHex('000000'), [0, 0, 0])
    assert.equal(parseHex('#ff000080')?.[0], 1)
    assert.equal(parseHex('red'), null)
    assert.equal(parseHex('#12345'), null)
    assert.equal(parseHex('#fff; } body { x'), null)
  })

  it('converts to OKLCH like culori did (the values the starter stored before)', () => {
    const primary = hexToOklchValue('#1f4536')
    assert.ok(primary)
    close(primary.l, 0.3574065398775049)
    close(primary.c, 0.051285876162572734)
    close(primary.h, 165.63821685384457, 0.01)
    assert.equal(hexToOklch('#ffffff'), 'oklch(1 0 0)')
    assert.equal(hexToOklch('#000000'), 'oklch(0 0 0)')
    assert.equal(hexToOklch('nope'), null)
  })

  it('derives the shadcn variables from the core colors', () => {
    const tokens = deriveColors(DEMO.colors)
    assert.equal(tokens['primary-foreground'], 'oklch(0.985 0 0)')
    assert.equal(tokens['secondary-foreground'], 'oklch(0.145 0 0)')
    assert.equal(tokens.card, tokens.background)
    assert.equal(tokens['muted-foreground'], 'oklch(0.4597 0.0072 87.47)')
    assert.equal(tokens.border, 'oklch(0.8606 0.0093 87.47)')
    assert.equal(tokens['chart-2'], 'oklch(0.3074 0.0513 195.64)')
    assert.equal(Object.keys(tokens).length, 32)
  })

  it('skips empty and invalid colors', () => {
    assert.deepEqual(deriveColors({}), {})
    assert.deepEqual(deriveColors(null), {})
    const tokens = deriveColors({ primary: 'javascript:alert(1)', background: '#ffffff' })
    assert.equal(tokens.primary, undefined)
    assert.equal(tokens.background, 'oklch(1 0 0)')
  })
})

describe('theme css', () => {
  it('writes only the values the theme sets', () => {
    assert.equal(themeCss({}), '')
    assert.equal(themeCss(null), '')
    assert.deepEqual(themeVariables({ borderRadius: '0.75' }), { '--radius': '0.75rem' })
    assert.deepEqual(themeVariables({ spacing: { baseMultiplier: 4 } }), { '--spacing': '0.25rem' })
    assert.deepEqual(themeVariables({ borderRadius: '', spacing: { baseMultiplier: null } }), {})
  })

  it('outputs the demo theme as fallback font faces and one :root:root rule with fonts', () => {
    const css = themeCss(DEMO)
    assert.match(css, /\n:root:root \{ .* \}$/)
    assert.match(css, /--primary: oklch\(0\.3574 0\.0513 165\.64\);/)
    assert.match(css, /--radius: 0\.5rem;/)
    assert.match(css, /--font-sans: 'Hanken Grotesk', 'Hanken Grotesk Fallback', sans-serif;/)
    assert.match(css, /--font-heading: 'Newsreader', 'Newsreader Fallback', serif;/)
    assert.doesNotMatch(css, /--font-mono/)
  })

  it('adds a size-matched fallback face for a known family, and none for an unknown one', () => {
    const css = themeCss({ fonts: { sans: 'Inter', heading: 'My Custom Font' } })
    assert.match(css, /@font-face \{ font-family: 'Inter Fallback'; src: local\('Arial'\); size-adjust: 107\.12%; /)
    assert.match(css, /ascent-override: 90\.44%; descent-override: 22\.52%; line-gap-override: 0%; \}/)
    assert.match(css, /--font-heading: 'My Custom Font', serif;/)
    assert.doesNotMatch(css, /My Custom Font Fallback/)
    const serif = themeCss({ fonts: { heading: 'Newsreader' } })
    assert.match(serif, /font-family: 'Newsreader Fallback'; src: local\('Times New Roman'\)/)
  })

  it('cleans font names so they cannot break out of CSS', () => {
    assert.equal(cleanFamily("Inter'; } body { color: red"), 'Inter body color red')
    assert.equal(cleanFamily('  Noto   Sans JP '), 'Noto Sans JP')
    assert.equal(cleanFamily('<>'), null)
    assert.deepEqual(themeFontFamilies({ fonts: { sans: 'Inter', heading: '', mono: null } }), { sans: 'Inter' })
  })

  it('builds one Google Fonts URL for all families', () => {
    assert.equal(googleFontsHref([]), null)
    assert.equal(
      googleFontsHref(['Hanken Grotesk', 'Newsreader', 'Newsreader']),
      'https://fonts.googleapis.com/css?family=Hanken%20Grotesk:400,400i,500,600,700|Newsreader:400,400i,500,600,700&display=swap',
    )
    assert.deepEqual(themeOutput({}), { css: '', fontsHref: null })
  })
})

describe('font tokens', () => {
  const families = { sans: 'Hanken Grotesk', heading: 'Newsreader' }

  it('resolves font variables and aliases to the theme families', () => {
    assert.equal(resolveFontValue('var(--font-sans)', families), 'Hanken Grotesk')
    assert.equal(resolveFontValue('var(--font-heading, var(--font-sans))', families), 'Newsreader')
    assert.equal(resolveFontValue('var(--font-heading, var(--font-sans))', { sans: 'Inter' }), 'Inter')
    assert.equal(resolveFontValue('var(--font-heading, var(--font-sans))', {}), 'var(--font-heading, var(--font-sans))')
    assert.equal(resolveFontValue('var(--font-mono)', families), 'var(--font-mono)')
  })

  it('maps the token list', () => {
    const fonts = applyFontFamilies(
      [
        { name: 'sans', value: 'var(--font-sans)' },
        { name: 'display', value: 'var(--font-heading, var(--font-sans))' },
        { name: 'mono', value: 'var(--font-mono)' },
      ],
      families,
    )
    assert.deepEqual(
      fonts.map((t) => t.value),
      ['Hanken Grotesk', 'Newsreader', 'var(--font-mono)'],
    )
  })
})

const base = (): Config =>
  ({
    collections: [{ slug: 'pages', fields: [{ name: 'title', type: 'text' }] }],
    globals: [],
  }) as unknown as Config
const run = (theme: unknown, config = base()) =>
  websiteBuilder({ collections: { pages: {} }, css: { entry: 'globals.css' }, theme: theme as never })(config) as Config

describe('websiteBuilder theme option', () => {

  it('adds the theme global and endpoint by default', () => {
    const config = run(undefined)
    const global = config.globals?.find((g) => g.slug === 'theme-settings')
    assert.ok(global)
    assert.deepEqual(themeConfigOf({ config: config as never }), { slug: 'theme-settings', cacheTag: 'theme-settings', endpoint: '/api/builder/theme' })
    assert.ok(config.endpoints?.some((e) => e.path === '/builder/theme'))
    const names = global.fields.map((f) => ('name' in f ? f.name : null))
    for (const name of ['colors', 'fonts', 'spacing', 'borderRadius', 'derivedTokens']) assert.ok(names.includes(name), name)
  })

  it('takes a slug, cache tag and admin options', () => {
    const config = run({ slug: 'site-theme', cacheTag: 'theme', admin: { group: 'Design' } })
    const global = config.globals?.find((g) => g.slug === 'site-theme')
    assert.equal(global?.admin?.group, 'Design')
    assert.equal(themeConfigOf({ config: config as never })?.cacheTag, 'theme')
  })

  it('leaves the theme out with theme: false', () => {
    const config = run(false)
    assert.equal(config.globals?.length, 0)
    assert.equal(config.custom?.[THEME_CONFIG_KEY], undefined)
    assert.ok(!config.endpoints?.some((e) => e.path === '/builder/theme'))
  })

  it('refuses a global with the same slug', () => {
    const config = base()
    config.globals = [{ slug: 'theme-settings', fields: [] }]
    assert.throws(() => run(undefined, config), /already exists/)
  })

  it('derives the color tokens on save', async () => {
    const global = run(undefined).globals?.find((g) => g.slug === 'theme-settings')
    const hook = global?.hooks?.beforeChange?.[0]
    assert.ok(hook)
    const result = await hook({ data: { colors: { primary: '#ffffff' } }, originalDoc: { colors: { background: '#000000' } } } as never)
    assert.equal(result.derivedTokens.primary, 'oklch(1 0 0)')
    assert.equal(result.derivedTokens.background, 'oklch(0 0 0)')
  })
})
