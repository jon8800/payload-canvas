import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  HIDDEN_STYLE_PROPERTIES,
  STYLE_PROPERTIES,
  getStyleProperty,
  parseClassName,
  parseVariant,
  variantPrefix,
  type StyleTokenHints,
} from '../styles'
import { EXACT, getSpec, optionUtility, shorthandChain, shorthandSides } from './properties'

function parseOne(raw: string, tokens?: StyleTokenHints) {
  const [parsed] = parseClassName(raw, tokens)
  return parsed
}

// [class, property, value]
const PROPERTY_CASES: Array<[string, string | null, string | null]> = [
  // text-*: size vs color vs align vs wrap
  ['text-lg', 'font-size', 'lg'],
  ['text-base', 'font-size', 'base'],
  ['text-xs', 'font-size', 'xs'],
  ['text-9xl', 'font-size', '9xl'],
  ['text-lg/7', 'font-size', 'lg/7'],
  ['text-[14px]', 'font-size', '[14px]'],
  ['text-[1.5rem]', 'font-size', '[1.5rem]'],
  ['text-[length:var(--size)]', 'font-size', '[length:var(--size)]'],
  ['text-(length:--size)', 'font-size', '(length:--size)'],
  ['text-[clamp(1rem,2vw,2rem)]', 'font-size', '[clamp(1rem,2vw,2rem)]'],
  ['text-red-500', 'text-color', 'red-500'],
  ['text-primary', 'text-color', 'primary'],
  ['text-primary-foreground', 'text-color', 'primary-foreground'],
  ['text-muted', 'text-color', 'muted'],
  ['text-white/80', 'text-color', 'white/80'],
  ['text-black/[0.3]', 'text-color', 'black/[0.3]'],
  ['text-[#fff]', 'text-color', '[#fff]'],
  ['text-[rgb(0,0,0)]', 'text-color', '[rgb(0,0,0)]'],
  ['text-[var(--brand)]', 'text-color', '[var(--brand)]'],
  ['text-(--my-var)', 'text-color', '(--my-var)'],
  ['text-(color:--x)', 'text-color', '(color:--x)'],
  ['text-center', 'text-align', 'center'],
  ['text-left', 'text-align', 'left'],
  ['text-justify', 'text-align', 'justify'],
  ['text-start', 'text-align', 'start'],
  ['text-balance', 'text-wrap', 'balance'],
  ['text-nowrap', 'text-wrap', 'nowrap'],
  ['text-wrap', 'text-wrap', 'wrap'],
  ['text-ellipsis', null, null],
  ['text-shadow-md', null, null],
  // border-*
  ['border', 'border-width', '1'],
  ['border-0', 'border-width', '0'],
  ['border-2', 'border-width', '2'],
  ['border-[3px]', 'border-width', '[3px]'],
  ['border-(length:--w)', 'border-width', '(length:--w)'],
  ['border-t', 'border-width-top', '1'],
  ['border-t-2', 'border-width-top', '2'],
  ['border-r-4', 'border-width-right', '4'],
  ['border-b-0', 'border-width-bottom', '0'],
  ['border-l', 'border-width-left', '1'],
  ['border-x-2', 'border-width-x', '2'],
  ['border-y', 'border-width-y', '1'],
  ['border-red-500', 'border-color', 'red-500'],
  ['border-primary/50', 'border-color', 'primary/50'],
  ['border-black', 'border-color', 'black'],
  ['border-blue-500', 'border-color', 'blue-500'],
  ['border-[#ccc]', 'border-color', '[#ccc]'],
  ['border-(--line)', 'border-color', '(--line)'],
  ['border-dashed', 'border-style', 'dashed'],
  ['border-none', 'border-style', 'none'],
  ['border-t-red-500', null, null],
  ['border-s-2', null, null],
  ['border-collapse', null, null],
  ['border-spacing-2', null, null],
  // bg-*
  ['bg-red-500', 'background-color', 'red-500'],
  ['bg-primary/50', 'background-color', 'primary/50'],
  ['bg-[#fff]', 'background-color', '[#fff]'],
  ['bg-(--surface)', 'background-color', '(--surface)'],
  ['bg-transparent', 'background-color', 'transparent'],
  ['bg-linear-to-r', 'gradient-direction', 'to-r'],
  ['bg-linear-to-tl', 'gradient-direction', 'to-tl'],
  ['bg-linear-45', 'gradient-direction', '45'],
  ['bg-linear-[25deg]', 'gradient-direction', '[25deg]'],
  ['bg-gradient-to-b', 'gradient-direction', 'to-b'],
  ['bg-cover', null, null],
  ['bg-center', null, null],
  ['bg-no-repeat', null, null],
  ['bg-clip-text', null, null],
  ['bg-[url(/img.png)]', null, null],
  ['bg-radial', null, null],
  ['from-red-500', 'gradient-from', 'red-500'],
  ['via-primary/20', 'gradient-via', 'primary/20'],
  ['to-[#000]', 'gradient-to', '[#000]'],
  ['from-10%', null, null],
  ['from-[20%]', null, null],
  // shadow-*
  ['shadow', 'shadow', 'DEFAULT'],
  ['shadow-md', 'shadow', 'md'],
  ['shadow-2xl', 'shadow', '2xl'],
  ['shadow-none', 'shadow', 'none'],
  ['shadow-lg/20', 'shadow', 'lg/20'],
  ['shadow-[0_0_4px_rgba(0,0,0,.5)]', 'shadow', '[0_0_4px_rgba(0,0,0,.5)]'],
  ['shadow-card', 'shadow', 'card'],
  ['shadow-red-500', null, null],
  ['shadow-black', null, null],
  ['shadow-[#000]', null, null],
  ['inset-shadow-sm', null, null],
  ['drop-shadow-md', null, null],
  // font-*
  ['font-bold', 'font-weight', 'bold'],
  ['font-black', 'font-weight', 'black'],
  ['font-[550]', 'font-weight', '[550]'],
  ['font-(--weight)', 'font-weight', '(--weight)'],
  ['font-sans', 'font-family', 'sans'],
  ['font-heading', 'font-family', 'heading'],
  ['font-[Inter]', 'font-family', '[Inter]'],
  ['font-(family-name:--font)', 'font-family', '(family-name:--font)'],
  ['font-stretch-condensed', null, null],
  // rounded-*
  ['rounded', 'radius', 'DEFAULT'],
  ['rounded-lg', 'radius', 'lg'],
  ['rounded-full', 'radius', 'full'],
  ['rounded-[10px]', 'radius', '[10px]'],
  ['rounded-t-lg', 'radius-t', 'lg'],
  ['rounded-b', 'radius-b', 'DEFAULT'],
  ['rounded-tl-lg', 'radius-tl', 'lg'],
  ['rounded-br-none', 'radius-br', 'none'],
  ['rounded-tr', 'radius-tr', 'DEFAULT'],
  ['rounded-s-lg', null, null],
  ['rounded-ss-lg', null, null],
  // size
  ['w-1/2', 'width', '1/2'],
  ['w-full', 'width', 'full'],
  ['w-screen', 'width', 'screen'],
  ['w-auto', 'width', 'auto'],
  ['w-64', 'width', '64'],
  ['w-[37px]', 'width', '[37px]'],
  ['h-dvh', 'height', 'dvh'],
  ['min-w-0', 'min-width', '0'],
  ['max-w-7xl', 'max-width', '7xl'],
  ['max-w-prose', 'max-width', 'prose'],
  ['min-h-screen', 'min-height', 'screen'],
  ['max-h-[50vh]', 'max-height', '[50vh]'],
  ['size-4', 'size', '4'],
  ['aspect-video', 'aspect-ratio', 'video'],
  ['aspect-3/4', 'aspect-ratio', '3/4'],
  ['aspect-[4/3]', 'aspect-ratio', '[4/3]'],
  ['object-cover', 'object-fit', 'cover'],
  ['object-center', null, null],
  // layout
  ['block', 'display', 'block'],
  ['hidden', 'display', 'hidden'],
  ['inline-grid', 'display', 'inline-grid'],
  ['contents', 'display', 'contents'],
  ['flex', 'display', 'flex'],
  ['flex-row', 'flex-direction', 'row'],
  ['flex-col-reverse', 'flex-direction', 'col-reverse'],
  ['flex-wrap', 'flex-wrap', 'wrap'],
  ['flex-nowrap', 'flex-wrap', 'nowrap'],
  ['flex-1', 'flex', '1'],
  ['flex-none', 'flex', 'none'],
  ['flex-2', 'flex', '2'],
  ['flex-[2_2_0%]', 'flex', '[2_2_0%]'],
  ['justify-between', 'justify-content', 'between'],
  ['justify-items-center', null, null],
  ['items-center', 'align-items', 'center'],
  ['content-around', 'align-content', 'around'],
  ['content-none', null, null],
  ['self-end', 'align-self', 'end'],
  ['gap-4', 'gap', '4'],
  ['gap-x-2', 'gap-x', '2'],
  ['gap-y-[3px]', 'gap-y', '[3px]'],
  ['grid-cols-3', 'grid-cols', '3'],
  ['grid-cols-[repeat(auto-fill,minmax(200px,1fr))]', 'grid-cols', '[repeat(auto-fill,minmax(200px,1fr))]'],
  ['grid-rows-none', 'grid-rows', 'none'],
  ['grid-flow-row', null, null],
  ['col-span-2', 'col-span', '2'],
  ['col-span-full', 'col-span', 'full'],
  ['row-span-3', 'row-span', '3'],
  ['col-start-2', null, null],
  ['grow', 'grow', '1'],
  ['grow-0', 'grow', '0'],
  ['shrink', 'shrink', '1'],
  ['shrink-0', 'shrink', '0'],
  ['basis-1/3', 'basis', '1/3'],
  ['order-first', 'order', 'first'],
  ['overflow-hidden', 'overflow', 'hidden'],
  ['overflow-x-auto', 'overflow-x', 'auto'],
  ['overflow-y-scroll', 'overflow-y', 'scroll'],
  // spacing
  ['p-4', 'padding', '4'],
  ['px-2', 'padding-x', '2'],
  ['py-0.5', 'padding-y', '0.5'],
  ['pt-px', 'padding-top', 'px'],
  ['pl-[7px]', 'padding-left', '[7px]'],
  ['m-auto', 'margin', 'auto'],
  ['mx-auto', 'margin-x', 'auto'],
  ['mb-8', 'margin-bottom', '8'],
  ['space-x-4', 'space-x', '4'],
  ['space-x-reverse', null, null],
  ['ps-4', null, null],
  // typography
  ['leading-tight', 'line-height', 'tight'],
  ['leading-6', 'line-height', '6'],
  ['tracking-wide', 'letter-spacing', 'wide'],
  ['uppercase', 'text-transform', 'uppercase'],
  ['normal-case', 'text-transform', 'normal-case'],
  ['underline', 'text-decoration', 'underline'],
  ['line-through', 'text-decoration', 'line-through'],
  ['italic', 'font-style', 'italic'],
  ['not-italic', 'font-style', 'not-italic'],
  ['whitespace-nowrap', 'white-space', 'nowrap'],
  ['whitespace-pre-line', 'white-space', 'pre-line'],
  // effects
  ['opacity-50', 'opacity', '50'],
  ['opacity-[.35]', 'opacity', '[.35]'],
  ['cursor-pointer', 'cursor', 'pointer'],
  ['cursor-zoom-in', 'cursor', 'zoom-in'],
  // position
  ['absolute', 'position', 'absolute'],
  ['sticky', 'position', 'sticky'],
  ['inset-0', 'inset', '0'],
  ['inset-x-0', 'inset-x', '0'],
  ['inset-y-4', 'inset-y', '4'],
  ['top-1/2', 'top', '1/2'],
  ['left-full', 'left', 'full'],
  ['z-10', 'z-index', '10'],
  ['z-auto', 'z-index', 'auto'],
  ['inset-ring-2', null, null],
  ['start-0', null, null],
  // not managed at all
  ['foo', null, null],
  ['container', null, null],
  ['[mask-type:luminance]', null, null],
  ['translate-x-4', null, null],
  ['transition', null, null],
]

describe('parseClassName: property and value', () => {
  for (const [raw, property, value] of PROPERTY_CASES) {
    it(`${raw} → ${property ?? 'unmanaged'}`, () => {
      const parsed = parseOne(raw)
      assert.equal(parsed.property, property)
      assert.equal(parsed.value, value)
    })
  }
})

describe('parseClassName: variants, important, negative', () => {
  const cases: Array<[string, Partial<ReturnType<typeof parseOne>>]> = [
    ['md:pt-4', { variants: ['md'], utility: 'pt-4', property: 'padding-top', value: '4' }],
    ['md:hover:pt-4', { variants: ['md', 'hover'], utility: 'pt-4' }],
    ['hover:md:pt-4', { variants: ['hover', 'md'], property: 'padding-top' }],
    ['[&>*]:p-4', { variants: ['[&>*]'], utility: 'p-4', property: 'padding' }],
    ['data-[state=open]:bg-red-500', { variants: ['data-[state=open]'], property: 'background-color' }],
    ['group-hover:text-primary', { variants: ['group-hover'], property: 'text-color' }],
    ['supports-[display:grid]:grid', { variants: ['supports-[display:grid]'], property: 'display', value: 'grid' }],
    ['dark:md:bg-black', { variants: ['dark', 'md'], property: 'background-color' }],
    ['bg-[url(http://x.y/a.png)]', { variants: [], utility: 'bg-[url(http://x.y/a.png)]', property: null }],
    ['text-[length:14px]', { variants: [], property: 'font-size', value: '[length:14px]' }],
    ['pt-4!', { important: true, utility: 'pt-4', property: 'padding-top' }],
    ['!pt-4', { important: true, utility: 'pt-4', property: 'padding-top' }],
    ['md:!pt-4', { important: true, variants: ['md'], utility: 'pt-4' }],
    ['-mt-4', { negative: true, utility: 'mt-4', property: 'margin-top', value: '4' }],
    ['md:-mt-4', { negative: true, variants: ['md'], property: 'margin-top' }],
    ['-mt-4!', { negative: true, important: true, property: 'margin-top' }],
    ['!-mt-4', { negative: true, important: true, property: 'margin-top' }],
    ['-z-10', { negative: true, property: 'z-index', value: '10' }],
    ['-top-2', { negative: true, property: 'top', value: '2' }],
    ['-inset-x-4', { negative: true, property: 'inset-x', value: '4' }],
    ['-order-1', { negative: true, property: 'order', value: '1' }],
    ['-space-y-2', { negative: true, property: 'space-y' }],
    ['-pt-4', { negative: true, utility: 'pt-4', property: null, value: null }],
    ['-w-4', { negative: true, property: null }],
    ['mt-[-4px]', { negative: false, property: 'margin-top', value: '[-4px]' }],
    ['p-[calc(1rem+2px)]', { property: 'padding', value: '[calc(1rem+2px)]' }],
    ['w-[calc(100%_-_2rem)]', { property: 'width', value: '[calc(100%_-_2rem)]' }],
    ['p-(--gap)', { property: 'padding', value: '(--gap)' }],
  ]
  for (const [raw, expected] of cases) {
    it(raw, () => {
      const parsed = parseOne(raw)
      assert.equal(parsed.raw, raw)
      for (const [key, value] of Object.entries(expected)) {
        assert.deepEqual(parsed[key as keyof typeof parsed], value, key)
      }
    })
  }

  it('splits on any whitespace, keeps order and duplicates', () => {
    const parsed = parseClassName('  p-4\tflex\n  p-4 ')
    assert.deepEqual(
      parsed.map((item) => item.raw),
      ['p-4', 'flex', 'p-4'],
    )
  })

  it('returns [] for an empty className', () => {
    assert.deepEqual(parseClassName(''), [])
    assert.deepEqual(parseClassName('   '), [])
  })
})

describe('parseClassName: theme token hints', () => {
  const tokens: StyleTokenHints = {
    fontSizes: [{ name: 'display', value: '4rem' }],
    fontWeights: [{ name: 'heavy', value: '850' }],
    shadows: [{ name: 'brand-200', value: '0 0 1px red' }],
    colors: [{ name: 'brand', value: 'var(--brand)' }],
  }
  const cases: Array<[string, string | null, string | null]> = [
    ['text-display', 'text-color', 'font-size'],
    ['font-heavy', 'font-family', 'font-weight'],
    ['shadow-brand', 'shadow', null],
    ['shadow-brand-200', null, 'shadow'],
    ['text-brand', 'text-color', 'text-color'],
  ]
  for (const [raw, without, withTokens] of cases) {
    it(`${raw}: ${without} → ${withTokens}`, () => {
      assert.equal(parseOne(raw).property, without)
      assert.equal(parseOne(raw, tokens).property, withTokens)
    })
  }
})

describe('parseVariant and variantPrefix', () => {
  const cases: Array<[string[], string | null]> = [
    [[], 'base/default'],
    [['md'], 'md/default'],
    [['hover'], 'base/hover'],
    [['md', 'hover'], 'md/hover'],
    [['hover', '2xl'], '2xl/hover'],
    [['focus'], 'base/focus'],
    [['active'], 'base/active'],
    [['dark'], null],
    [['group-hover'], null],
    [['md', 'lg'], null],
    [['hover', 'focus'], null],
    [['base'], null],
    [['max-md'], null],
    [['[&>*]'], null],
  ]
  for (const [prefixes, expected] of cases) {
    it(`[${prefixes.join(', ')}] → ${expected}`, () => {
      const variant = parseVariant(prefixes)
      assert.equal(variant ? `${variant.breakpoint}/${variant.state}` : null, expected)
    })
  }

  it('writes breakpoint before state', () => {
    assert.equal(variantPrefix({ breakpoint: 'base', state: 'default' }), '')
    assert.equal(variantPrefix({ breakpoint: 'md', state: 'default' }), 'md:')
    assert.equal(variantPrefix({ breakpoint: 'base', state: 'focus' }), 'focus:')
    assert.equal(variantPrefix({ breakpoint: 'xl', state: 'hover' }), 'xl:hover:')
  })
})

describe('property table', () => {
  const REQUIRED: Record<string, string[]> = {
    layout: ['display', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'align-self', 'gap', 'gap-x', 'gap-y', 'grid-cols', 'grid-rows', 'col-span', 'row-span', 'flex', 'grow', 'shrink', 'basis', 'order', 'overflow', 'overflow-x', 'overflow-y'],
    spacing: ['padding', 'padding-x', 'padding-y', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin', 'margin-x', 'margin-y', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'space-x', 'space-y'],
    size: ['width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'aspect-ratio', 'object-fit'],
    typography: ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-color', 'text-align', 'text-transform', 'text-decoration', 'font-style', 'white-space', 'text-wrap'],
    background: ['background-color', 'gradient-direction', 'gradient-from', 'gradient-via', 'gradient-to'],
    border: ['radius', 'radius-tl', 'radius-tr', 'radius-br', 'radius-bl', 'border-width', 'border-width-top', 'border-width-right', 'border-width-bottom', 'border-width-left', 'border-style', 'border-color'],
    effects: ['opacity', 'shadow', 'cursor'],
    position: ['position', 'inset', 'top', 'right', 'bottom', 'left', 'z-index'],
  }

  it('has exactly the agreed property ids, in order, per group', () => {
    for (const [group, ids] of Object.entries(REQUIRED)) {
      assert.deepEqual(
        STYLE_PROPERTIES.filter((property) => property.group === group).map((property) => property.id),
        ids,
        group,
      )
    }
    assert.equal(STYLE_PROPERTIES.length, Object.values(REQUIRED).flat().length)
  })

  it('gives every property a label, enums options, tokens a token list', () => {
    for (const property of STYLE_PROPERTIES) {
      assert.ok(property.label, property.id)
      if (property.kind === 'enum') assert.ok(property.options?.length, property.id)
      if (property.kind === 'token') assert.ok(property.tokens, property.id)
    }
  })

  it('marks negative properties', () => {
    const negative = STYLE_PROPERTIES.filter((property) => property.negative).map((property) => property.id)
    assert.deepEqual(negative, ['order', 'margin', 'margin-x', 'margin-y', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'space-x', 'space-y', 'inset', 'top', 'right', 'bottom', 'left', 'z-index'])
  })

  it('keeps hidden shorthands out of STYLE_PROPERTIES', () => {
    assert.deepEqual(
      HIDDEN_STYLE_PROPERTIES.map((property) => property.id),
      ['size', 'radius-t', 'radius-r', 'radius-b', 'radius-l', 'border-width-x', 'border-width-y', 'inset-x', 'inset-y'],
    )
    assert.equal(getStyleProperty('radius-t')?.group, 'border')
    assert.equal(getStyleProperty('nope'), undefined)
  })

  it('maps every enum option to a utility that parses back to the same property and value', () => {
    for (const property of [...STYLE_PROPERTIES, ...HIDDEN_STYLE_PROPERTIES]) {
      const spec = getSpec(property.id)
      assert.ok(spec)
      for (const option of property.options ?? []) {
        const utility = optionUtility(spec, option.value)
        assert.equal(EXACT.get(utility)?.spec.id, property.id, utility)
        const parsed = parseOne(utility)
        assert.equal(parsed.property, property.id, utility)
        assert.equal(parsed.value, option.value, utility)
      }
    }
  })

  it('builds shorthand chains nearest first', () => {
    assert.deepEqual(shorthandChain('padding-top'), ['padding-top', 'padding-y', 'padding'])
    assert.deepEqual(shorthandChain('radius-tl'), ['radius-tl', 'radius-t', 'radius-l', 'radius'])
    assert.deepEqual(shorthandChain('border-width-left'), ['border-width-left', 'border-width-x', 'border-width'])
    assert.deepEqual(shorthandChain('left'), ['left', 'inset-x', 'inset'])
    assert.deepEqual(shorthandChain('width'), ['width', 'size'])
    assert.deepEqual(shorthandChain('gap-x'), ['gap-x', 'gap'])
    assert.deepEqual(shorthandChain('display'), ['display'])
  })

  it('lists the sides a shorthand covers', () => {
    assert.deepEqual([...shorthandSides('padding')].toSorted(), ['padding-bottom', 'padding-left', 'padding-right', 'padding-top', 'padding-x', 'padding-y'])
    assert.deepEqual([...shorthandSides('padding-x')].toSorted(), ['padding-left', 'padding-right'])
    assert.deepEqual([...shorthandSides('radius-t')].toSorted(), ['radius-tl', 'radius-tr'])
    assert.equal(shorthandSides('padding-top').size, 0)
  })
})
