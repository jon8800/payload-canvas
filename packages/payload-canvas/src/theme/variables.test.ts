import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { googleFontsHref, themeCss, themeFontFamilies, themeVariables } from './css'
import {
  cleanVariables,
  textUsesVariable,
  tokenUsesVariable,
  variableNameProblem,
  variablesProblems,
  variablesThemeCss,
  variableTokens,
  variableValueProblem,
  type ThemeVariable,
} from './variables'

const VARIABLES: ThemeVariable[] = [
  { name: 'brand', type: 'color', value: '#1f4536', darkValue: '#8fd1b4' },
  { name: 'gutter', type: 'size', value: '1.5rem', darkValue: '' },
  { name: 'display', type: 'font', value: 'Fraunces', darkValue: '#fff' },
]

describe('design variables', () => {
  it('checks names per type: form, length and names the theme already uses', () => {
    assert.equal(variableNameProblem('brand', 'color'), null)
    assert.equal(variableNameProblem('space-lg', 'size'), null)
    assert.match(variableNameProblem('Brand', 'color') ?? '', /lower-case/)
    assert.match(variableNameProblem('1brand', 'color') ?? '', /start with a letter/)
    assert.match(variableNameProblem('a--b', 'color') ?? '', /single dashes/)
    assert.match(variableNameProblem('primary', 'color') ?? '', /taken/)
    assert.match(variableNameProblem('red-500', 'color') ?? '', /taken/)
    assert.match(variableNameProblem('full', 'size') ?? '', /taken/)
    assert.match(variableNameProblem('sans', 'font') ?? '', /taken/)
    assert.equal(variableNameProblem('primary', 'size'), null, 'only the same type clashes')
  })

  it('checks values per type and refuses CSS that could break out of the rule', () => {
    assert.equal(variableValueProblem('#fff', 'color'), null)
    assert.equal(variableValueProblem('oklch(0.6 0.1 200)', 'color'), null)
    assert.equal(variableValueProblem('clamp(1rem, 4vw, 3rem)', 'size'), null)
    assert.equal(variableValueProblem('24px', 'size'), null)
    assert.equal(variableValueProblem('Hanken Grotesk', 'font'), null)
    assert.equal(variableValueProblem('', 'size'), null, 'empty is allowed (left out)')
    assert.match(variableValueProblem('#fff; } body { color: red', 'color') ?? '', /characters/)
    assert.match(variableValueProblem('big', 'size') ?? '', /size/)
    assert.match(variableValueProblem('1rem 2rem', 'size') ?? '', /size/)
  })

  it('reports list problems by row: duplicates, names, values', () => {
    assert.equal(variablesProblems(VARIABLES), true)
    assert.match(String(variablesProblems([...VARIABLES, { name: 'brand', type: 'color', value: '#000' }])), /Variable 4: “brand” is used twice/)
    assert.match(String(variablesProblems([{ name: 'gap', type: 'size', value: 'wide' }])), /Variable 1 \(gap\)/)
  })

  it('keeps only usable rows; fonts have no dark value', () => {
    const clean = cleanVariables([...VARIABLES, { name: 'empty', type: 'color', value: '' }, { name: 'brand', type: 'color', value: '#000' }, null, { name: 'x', type: 'other' }])
    assert.deepEqual(
      clean.map((v) => [v.name, v.value, v.darkValue]),
      [
        ['brand', '#1f4536', '#8fd1b4'],
        ['gutter', '1.5rem', undefined],
        ['display', 'Fraunces', undefined],
      ],
    )
  })

  it('outputs the values in ThemeStyle: light in :root:root, dark under the .dark class, fonts with Google Fonts', () => {
    const theme = { variables: VARIABLES }
    const vars = themeVariables(theme)
    assert.equal(vars['--color-brand'], '#1f4536')
    assert.equal(vars['--spacing-gutter'], '1.5rem')
    assert.match(vars['--font-display'] ?? '', /^'Fraunces', .*sans-serif$/)
    const css = themeCss(theme)
    assert.match(css, /:root:root \{[^}]*--color-brand: #1f4536;/)
    assert.match(css, /:root:root\.dark, :root:root \.dark \{ --color-brand: #8fd1b4; \}/)
    assert.deepEqual(themeFontFamilies(theme), { display: 'Fraunces' })
    assert.match(googleFontsHref(Object.values(themeFontFamilies(theme))) ?? '', /family=Fraunces/)
    assert.equal(themeCss({ variables: [] }), '')
  })

  it('registers the names for the compile without values (the CSS only changes with the names)', () => {
    const css = variablesThemeCss(VARIABLES)
    assert.match(css, /@theme inline reference \{/)
    assert.match(css, /--color-brand: var\(--color-brand\);/)
    assert.match(css, /--spacing-gutter: var\(--spacing-gutter\);/)
    assert.match(css, /--font-display: var\(--font-display\);/)
    assert.equal(css, variablesThemeCss([{ ...VARIABLES[0], value: '#000' }, VARIABLES[2], VARIABLES[1]]), 'values and order do not change it')
    assert.equal(variablesThemeCss([]), '')
  })

  it('finds a variable in classes (any variant, opacity, sign) and in custom CSS', () => {
    const brand = { name: 'brand', type: 'color' } as const
    const gutter = { name: 'gutter', type: 'size' } as const
    assert.ok(tokenUsesVariable('bg-brand', brand))
    assert.ok(tokenUsesVariable('md:hover:text-brand/50', brand))
    assert.ok(tokenUsesVariable('border-t-brand!', brand))
    assert.ok(tokenUsesVariable('bg-(--color-brand)', brand))
    assert.ok(!tokenUsesVariable('bg-brand-2', brand))
    assert.ok(!tokenUsesVariable('p-brand', brand), 'a size utility does not use a color')
    assert.ok(tokenUsesVariable('-mt-gutter', gutter))
    assert.ok(tokenUsesVariable('gap-x-gutter', gutter))
    assert.ok(textUsesVariable('color: var(--color-brand);', brand))
    assert.ok(!textUsesVariable('color: var(--color-brand-dark);', brand))
    assert.ok(textUsesVariable('rounded p-4 lg:px-gutter', gutter))
  })

  it('describes the variables for the editor, the AI and MCP', () => {
    assert.deepEqual(variableTokens(VARIABLES)[0], { name: 'brand', type: 'color', property: '--color-brand', value: '#1f4536', darkValue: '#8fd1b4' })
  })
})
