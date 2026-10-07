import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  getStyleValue,
  setStyleValue,
  styleClass,
  unmanagedClasses,
  variantsInUse,
  type Breakpoint,
  type StyleState,
  type StyleValue,
  type Variant,
} from '../styles'

function v(breakpoint: Breakpoint = 'base', state: StyleState = 'default'): Variant {
  return { breakpoint, state }
}

const BASE = v()

function brief(value: StyleValue | null): string | null {
  if (!value) return null
  return `${value.negative ? '-' : ''}${value.value} ${value.source} ${value.className}`
}

describe('getStyleValue: exact, shorthand, inherited', () => {
  // [className, property, variant, expected "value source className" or null]
  const cases: Array<[string, string, Variant, string | null]> = [
    ['pt-4', 'padding-top', BASE, '4 set pt-4'],
    ['', 'padding-top', BASE, null],
    ['flex', 'padding-top', BASE, null],
    ['py-2', 'padding-top', BASE, '2 shorthand py-2'],
    ['p-4', 'padding-top', BASE, '4 shorthand p-4'],
    ['p-4 py-2', 'padding-top', BASE, '2 shorthand py-2'],
    ['py-2 p-4', 'padding-top', BASE, '2 shorthand py-2'],
    ['p-4 pt-8', 'padding-top', BASE, '8 set pt-8'],
    ['pt-8 p-4', 'padding-top', BASE, '8 set pt-8'],
    ['px-3', 'padding-top', BASE, null],
    ['px-3', 'padding-left', BASE, '3 shorthand px-3'],
    ['p-4', 'padding', BASE, '4 set p-4'],
    ['pt-4', 'padding', BASE, null],
    ['p-4', 'padding-x', BASE, '4 shorthand p-4'],
    ['m-4', 'margin-left', BASE, '4 shorthand m-4'],
    ['-mx-4', 'margin-left', BASE, '-4 shorthand -mx-4'],
    ['gap-4', 'gap-x', BASE, '4 shorthand gap-4'],
    ['gap-4 gap-x-2', 'gap-x', BASE, '2 set gap-x-2'],
    ['gap-4 gap-x-2', 'gap-y', BASE, '4 shorthand gap-4'],
    ['rounded-lg', 'radius-tl', BASE, 'lg shorthand rounded-lg'],
    ['rounded-t-xl', 'radius-tl', BASE, 'xl shorthand rounded-t-xl'],
    ['rounded-l-sm', 'radius-tl', BASE, 'sm shorthand rounded-l-sm'],
    ['rounded-t-xl', 'radius-bl', BASE, null],
    ['rounded-lg rounded-t-xl rounded-tl-none', 'radius-tl', BASE, 'none set rounded-tl-none'],
    ['rounded-lg rounded-t-xl', 'radius-tr', BASE, 'xl shorthand rounded-t-xl'],
    ['rounded-lg rounded-t-xl', 'radius-br', BASE, 'lg shorthand rounded-lg'],
    ['rounded', 'radius', BASE, 'DEFAULT set rounded'],
    ['border', 'border-width-top', BASE, '1 shorthand border'],
    ['border-y-2', 'border-width-top', BASE, '2 shorthand border-y-2'],
    ['border-x-2', 'border-width-top', BASE, null],
    ['border-2 border-x-4', 'border-width-left', BASE, '4 shorthand border-x-4'],
    ['border-2 border-l-0', 'border-width-left', BASE, '0 set border-l-0'],
    ['inset-0', 'top', BASE, '0 shorthand inset-0'],
    ['inset-x-0', 'left', BASE, '0 shorthand inset-x-0'],
    ['inset-x-0', 'top', BASE, null],
    ['-inset-x-2', 'right', BASE, '-2 shorthand -inset-x-2'],
    ['size-8', 'width', BASE, '8 shorthand size-8'],
    ['size-8 h-4', 'height', BASE, '4 set h-4'],
    ['overflow-hidden', 'overflow-y', BASE, 'hidden shorthand overflow-hidden'],
    // breakpoints, mobile first
    ['pt-4', 'padding-top', v('md'), '4 inherited pt-4'],
    ['pt-4 sm:pt-6', 'padding-top', v('lg'), '6 inherited sm:pt-6'],
    ['pt-4 sm:pt-6 lg:pt-8', 'padding-top', v('md'), '6 inherited sm:pt-6'],
    ['pt-4 lg:pt-8', 'padding-top', v('lg'), '8 set lg:pt-8'],
    ['lg:pt-8', 'padding-top', v('md'), null],
    ['lg:pt-8', 'padding-top', BASE, null],
    ['pt-4 md:p-8', 'padding-top', v('md'), '8 shorthand md:p-8'],
    ['md:pt-2 p-8', 'padding-top', v('lg'), '2 inherited md:pt-2'],
    ['p-8 sm:py-1', 'padding-top', v('xl'), '1 inherited sm:py-1'],
    ['hidden md:flex', 'display', v('sm'), 'hidden inherited hidden'],
    ['hidden md:flex', 'display', v('2xl'), 'flex inherited md:flex'],
    // states
    ['bg-white hover:bg-gray-100', 'background-color', v('base', 'hover'), 'gray-100 set hover:bg-gray-100'],
    ['bg-white', 'background-color', v('base', 'hover'), 'white inherited bg-white'],
    ['bg-white hover:bg-gray-100', 'background-color', v('base', 'focus'), 'white inherited bg-white'],
    ['bg-white hover:bg-gray-100', 'background-color', v('md', 'hover'), 'gray-100 inherited hover:bg-gray-100'],
    ['hover:bg-gray-100 md:bg-black', 'background-color', v('md', 'hover'), 'gray-100 inherited hover:bg-gray-100'],
    ['md:bg-black', 'background-color', v('lg', 'hover'), 'black inherited md:bg-black'],
    ['md:hover:p-4', 'padding-top', v('md', 'hover'), '4 shorthand md:hover:p-4'],
    ['hover:md:pt-4', 'padding-top', v('md', 'hover'), '4 set hover:md:pt-4'],
    ['hover:pt-4', 'padding-top', BASE, null],
    // unknown variants never count
    ['dark:pt-4', 'padding-top', BASE, null],
    ['group-hover:pt-4', 'padding-top', v('base', 'hover'), null],
    ['[&>*]:p-4', 'padding', BASE, null],
    // ambiguity in get
    ['text-lg text-red-500 text-center', 'font-size', BASE, 'lg set text-lg'],
    ['text-lg text-red-500 text-center', 'text-color', BASE, 'red-500 set text-red-500'],
    ['text-lg text-red-500 text-center', 'text-align', BASE, 'center set text-center'],
    ['border border-red-500 border-dashed', 'border-color', BASE, 'red-500 set border-red-500'],
    ['border-2 border-dashed', 'border-style', BASE, 'dashed set border-dashed'],
    ['shadow-md shadow-red-500', 'shadow', BASE, 'md set shadow-md'],
    ['font-bold font-heading', 'font-family', BASE, 'heading set font-heading'],
    // duplicates: the last one wins
    ['pt-2 pt-4', 'padding-top', BASE, '4 set pt-4'],
    // negative
    ['-mt-4', 'margin-top', BASE, '-4 set -mt-4'],
    ['-z-10', 'z-index', BASE, '-10 set -z-10'],
  ]
  for (const [className, property, variant, expected] of cases) {
    it(`"${className}" ${property} @ ${variant.breakpoint}/${variant.state}`, () => {
      assert.equal(brief(getStyleValue(className, property, variant)), expected)
    })
  }

  it('returns the variant of the class and the important flag', () => {
    const value = getStyleValue('sm:pt-4!', 'padding-top', v('lg'))
    assert.deepEqual(value, {
      value: '4',
      negative: false,
      className: 'sm:pt-4!',
      source: 'inherited',
      important: true,
      variant: v('sm'),
    })
  })

  it('lets an important class beat a more specific one', () => {
    assert.equal(brief(getStyleValue('pt-4! md:pt-8', 'padding-top', v('md'))), '4 inherited pt-4!')
    assert.equal(brief(getStyleValue('!p-4 pt-8', 'padding-top', BASE)), '4 shorthand !p-4')
    assert.equal(brief(getStyleValue('pt-4! md:pt-8!', 'padding-top', v('md'))), '8 set md:pt-8!')
  })

  it('uses theme token hints', () => {
    const tokens = { fontSizes: [{ name: 'display', value: '4rem' }] }
    assert.equal(getStyleValue('text-display', 'font-size', BASE), null)
    assert.equal(brief(getStyleValue('text-display', 'font-size', BASE, tokens)), 'display set text-display')
  })
})

describe('setStyleValue', () => {
  // [className, property, variant, value, expected]
  const cases: Array<[string, string, Variant, string | null, string]> = [
    // add, replace in place, keep order
    ['', 'padding-top', BASE, '4', 'pt-4'],
    ['flex', 'padding-top', BASE, '4', 'flex pt-4'],
    ['flex pt-2 gap-4', 'padding-top', BASE, '4', 'flex pt-4 gap-4'],
    ['flex pt-2 gap-4', 'padding-top', BASE, '2', 'flex pt-2 gap-4'],
    ['a pt-2 b pt-3 c', 'padding-top', BASE, '4', 'a pt-4 b c'],
    ['  flex\t pt-2  ', 'padding-top', BASE, '4', 'flex pt-4'],
    // variants
    ['pt-2', 'padding-top', v('md'), '4', 'pt-2 md:pt-4'],
    ['pt-2', 'padding-top', v('md', 'hover'), '4', 'pt-2 md:hover:pt-4'],
    ['pt-2', 'padding-top', v('base', 'focus'), '4', 'pt-2 focus:pt-4'],
    ['pt-2 md:pt-3 lg:pt-5', 'padding-top', v('md'), '4', 'pt-2 md:pt-4 lg:pt-5'],
    ['x hover:md:pt-3 y', 'padding-top', v('md', 'hover'), '4', 'x md:hover:pt-4 y'],
    ['md:pt-3 hover:md:pt-3', 'padding-top', v('md', 'hover'), '4', 'md:pt-3 md:hover:pt-4'],
    // unknown variants are never touched
    ['dark:pt-3', 'padding-top', BASE, '4', 'dark:pt-3 pt-4'],
    ['group-hover:pt-3 pt-1', 'padding-top', v('base', 'hover'), '4', 'group-hover:pt-3 pt-1 hover:pt-4'],
    ['dark:pt-3 pt-1', 'padding-top', BASE, null, 'dark:pt-3'],
    ['[&>*]:p-4 p-1', 'padding', BASE, '2', '[&>*]:p-4 p-2'],
    // removal
    ['flex pt-2 gap-4', 'padding-top', BASE, null, 'flex gap-4'],
    ['flex pt-2 gap-4', 'padding-top', BASE, '', 'flex gap-4'],
    ['flex pt-2 pt-3', 'padding-top', BASE, null, 'flex'],
    ['flex', 'padding-top', BASE, null, 'flex'],
    ['pt-2 md:pt-4', 'padding-top', v('md'), null, 'pt-2'],
    ['pt-2 md:pt-4', 'padding-top', BASE, null, 'md:pt-4'],
    ['p-4 pt-2', 'padding', BASE, null, 'pt-2'],
    ['p-4 pt-2', 'padding-top', BASE, null, 'p-4'],
    // shorthand rules
    ['p-4', 'padding-top', BASE, '8', 'p-4 pt-8'],
    ['px-1 p-2 pt-3', 'padding', BASE, '4', 'p-4'],
    ['flex pt-2 pb-3 px-1', 'padding', BASE, '4', 'flex p-4'],
    ['p-1 pt-2 pl-3', 'padding-x', BASE, '4', 'p-1 pt-2 px-4'],
    ['p-1 pt-2 pl-3', 'padding-y', BASE, '4', 'p-1 py-4 pl-3'],
    ['pt-2 md:pt-3', 'padding', BASE, '4', 'p-4 md:pt-3'],
    ['pt-2 md:pt-3', 'padding', v('md'), '4', 'pt-2 md:p-4'],
    ['rounded-t-lg rounded-tl-none rounded-br-sm', 'radius', BASE, 'xl', 'rounded-xl'],
    ['rounded-t-lg rounded-tl-none rounded-br-sm', 'radius-tl', BASE, 'md', 'rounded-t-lg rounded-tl-md rounded-br-sm'],
    ['border-t-2 border-x border-dashed', 'border-width', BASE, '4', 'border-4 border-dashed'],
    ['border-x-2 border-l-4', 'border-width-left', BASE, null, 'border-x-2'],
    ['top-0 left-0 inset-x-2', 'inset', BASE, '0', 'inset-0'],
    ['gap-x-2 gap-y-3', 'gap', BASE, '4', 'gap-4'],
    ['size-4', 'width', BASE, '8', 'size-4 w-8'],
    ['w-2 h-3', 'size', BASE, '4', 'size-4'],
    ['overflow-x-auto', 'overflow', BASE, 'hidden', 'overflow-hidden'],
    // hidden shorthands can be removed by id
    ['rounded-t-lg flex', 'radius-t', BASE, null, 'flex'],
    // ambiguous prefixes write the right class and leave the others alone
    ['text-lg text-red-500 text-center', 'font-size', BASE, 'xl', 'text-xl text-red-500 text-center'],
    ['text-lg text-red-500 text-center', 'text-color', BASE, 'primary', 'text-lg text-primary text-center'],
    ['text-lg text-red-500 text-center', 'text-align', BASE, 'right', 'text-lg text-red-500 text-right'],
    ['text-lg text-red-500 text-center', 'text-color', BASE, null, 'text-lg text-center'],
    ['border border-red-500 border-dashed', 'border-width', BASE, '2', 'border-2 border-red-500 border-dashed'],
    ['border-2 border-red-500', 'border-width', BASE, '1', 'border border-red-500'],
    ['border border-red-500 border-dashed', 'border-style', BASE, 'dotted', 'border border-red-500 border-dotted'],
    ['bg-red-500 bg-linear-to-r', 'gradient-direction', BASE, 'to-b', 'bg-red-500 bg-linear-to-b'],
    ['bg-gradient-to-r from-red-500', 'gradient-direction', BASE, 'to-l', 'bg-linear-to-l from-red-500'],
    ['bg-red-500 bg-linear-to-r', 'background-color', BASE, 'primary/50', 'bg-primary/50 bg-linear-to-r'],
    ['shadow-md shadow-red-500', 'shadow', BASE, 'lg', 'shadow-lg shadow-red-500'],
    ['shadow-md', 'shadow', BASE, 'DEFAULT', 'shadow'],
    ['rounded', 'radius', BASE, 'lg', 'rounded-lg'],
    ['font-bold font-sans', 'font-family', BASE, 'heading', 'font-bold font-heading'],
    ['font-bold font-sans', 'font-weight', BASE, 'medium', 'font-medium font-sans'],
    ['flex flex-col flex-1', 'flex-direction', BASE, 'row', 'flex flex-row flex-1'],
    ['flex flex-col flex-1', 'display', BASE, 'grid', 'grid flex-col flex-1'],
    ['flex flex-col flex-1', 'flex', BASE, 'none', 'flex flex-col flex-none'],
    ['flex', 'flex-wrap', BASE, 'wrap', 'flex flex-wrap'],
    ['grow', 'grow', BASE, '0', 'grow-0'],
    ['grow-0', 'grow', BASE, '1', 'grow'],
    ['uppercase', 'text-transform', BASE, 'normal-case', 'normal-case'],
    ['italic', 'font-style', BASE, 'not-italic', 'not-italic'],
    ['', 'aspect-ratio', BASE, '3/4', 'aspect-3/4'],
    ['', 'cursor', BASE, 'pointer', 'cursor-pointer'],
    ['', 'justify-content', BASE, 'between', 'justify-between'],
    ['', 'white-space', BASE, 'nowrap', 'whitespace-nowrap'],
    ['', 'text-wrap', BASE, 'balance', 'text-balance'],
    ['', 'width', BASE, '1/2', 'w-1/2'],
    ['', 'max-width', BASE, '7xl', 'max-w-7xl'],
    ['', 'grid-cols', BASE, '3', 'grid-cols-3'],
    ['', 'z-index', BASE, '10', 'z-10'],
    ['', 'overflow-x', BASE, 'auto', 'overflow-x-auto'],
    // negative values
    ['mt-2', 'margin-top', BASE, '-4', '-mt-4'],
    ['-mt-2', 'margin-top', BASE, '4', 'mt-4'],
    ['-mt-2 flex', 'margin-top', BASE, null, 'flex'],
    ['', 'top', v('md'), '-1/2', 'md:-top-1/2'],
    ['', 'z-index', BASE, '-10', '-z-10'],
    // arbitrary values
    ['pt-2', 'padding-top', BASE, '[37px]', 'pt-[37px]'],
    ['', 'width', BASE, '[calc(100% - 2rem)]', 'w-[calc(100%_-_2rem)]'],
    ['', 'grid-cols', BASE, '[repeat(auto-fill, minmax(200px, 1fr))]', 'grid-cols-[repeat(auto-fill,_minmax(200px,_1fr))]'],
    ['', 'margin-top', BASE, '[-4px]', 'mt-[-4px]'],
    ['', 'text-color', BASE, '[#fff]', 'text-[#fff]'],
    ['', 'font-size', BASE, '[14px]', 'text-[14px]'],
    ['', 'text-color', BASE, '(--brand)', 'text-(--brand)'],
    ['', 'background-color', BASE, 'white/[0.3]', 'bg-white/[0.3]'],
    ['', 'shadow', BASE, '[0 0 4px #000]', 'shadow-[0_0_4px_#000]'],
    // important is kept on replace
    ['pt-2!', 'padding-top', BASE, '4', 'pt-4!'],
    ['!pt-2', 'padding-top', BASE, '4', 'pt-4!'],
    ['md:!pt-2', 'padding-top', v('md'), '4', 'md:pt-4!'],
  ]
  for (const [className, property, variant, value, expected] of cases) {
    it(`"${className}" ${property} @ ${variant.breakpoint}/${variant.state} = ${value}`, () => {
      assert.equal(setStyleValue(className, property, variant, value), expected)
    })
  }

  it('takes negative and important from options', () => {
    assert.equal(setStyleValue('', 'margin-top', BASE, '4', { negative: true }), '-mt-4')
    assert.equal(setStyleValue('', 'inset', v('lg'), '2', { negative: true }), 'lg:-inset-2')
    assert.equal(setStyleValue('pt-2!', 'padding-top', BASE, '4', { important: false }), 'pt-4')
    assert.equal(setStyleValue('pt-2', 'padding-top', BASE, '4', { important: true }), 'pt-4!')
  })

  it('uses theme token hints to validate', () => {
    const tokens = { fontSizes: [{ name: 'display', value: '4rem' }] }
    assert.equal(setStyleValue('text-red-500', 'font-size', BASE, 'display', { tokens }), 'text-red-500 text-display')
    assert.throws(() => setStyleValue('', 'text-color', BASE, 'display', { tokens }), /not a valid value/)
  })

  it('throws on bad input', () => {
    assert.throws(() => setStyleValue('', 'nope', BASE, '4'), /Unknown style property/)
    assert.throws(() => setStyleValue('', 'display', BASE, 'table-cell'), /not an option/)
    assert.throws(() => setStyleValue('', 'padding-top', BASE, '-4'), /negative/)
    assert.throws(() => setStyleValue('', 'width', BASE, '4', { negative: true }), /negative/)
    assert.throws(() => setStyleValue('', 'text-color', BASE, 'lg'), /not a valid value/)
    assert.throws(() => setStyleValue('', 'font-size', BASE, 'red-500'), /not a valid value/)
    assert.throws(() => setStyleValue('', 'border-color', BASE, '2'), /not a valid value/)
    assert.throws(() => setStyleValue('', 'font-family', BASE, 'bold'), /not a valid value/)
    assert.throws(() => setStyleValue('', 'background-color', BASE, 'linear-to-r'), /not a valid value/)
  })

  it('round-trips: set then get returns the value as "set"', () => {
    const roundTrips: Array<[string, Variant, string]> = [
      ['padding-top', v('md', 'hover'), '4'],
      ['margin-left', v('lg'), '-2'],
      ['font-size', BASE, 'lg/7'],
      ['text-color', v('base', 'focus'), 'primary-foreground/80'],
      ['radius-bl', v('sm'), 'DEFAULT'],
      ['border-width-top', BASE, '1'],
      ['gradient-direction', BASE, '45'],
      ['width', BASE, '[37px]'],
      ['display', v('2xl'), 'inline-flex'],
      ['shadow', BASE, 'DEFAULT'],
    ]
    for (const [property, variant, value] of roundTrips) {
      const className = setStyleValue('flex p-1 rounded-sm border-2', property, variant, value)
      const result = getStyleValue(className, property, variant)
      assert.equal(result?.source, 'set', property)
      assert.equal(`${result?.negative ? '-' : ''}${result?.value}`, value, property)
    }
  })

  it('never produces duplicates', () => {
    let className = 'pt-2 pt-2 md:pt-2'
    for (const value of ['4', '4', '8', '2']) className = setStyleValue(className, 'padding-top', BASE, value)
    assert.equal(className, 'pt-2 md:pt-2')
  })
})

describe('styleClass', () => {
  it('builds one class', () => {
    assert.equal(styleClass('padding-top', v('md', 'hover'), '4'), 'md:hover:pt-4')
    assert.equal(styleClass('margin-top', BASE, '4', { negative: true, important: true }), '-mt-4!')
    assert.equal(styleClass('display', BASE, 'hidden'), 'hidden')
    assert.equal(styleClass('border-width', BASE, '1'), 'border')
  })
})

describe('unmanagedClasses', () => {
  const cases: Array<[string, string[]]> = [
    ['', []],
    ['flex p-4 text-lg', []],
    ['flex foo p-4 transition', ['foo', 'transition']],
    ['dark:bg-black hover:bg-red-500 group-hover:pt-4', ['dark:bg-black', 'group-hover:pt-4']],
    ['rounded-t-lg size-4 border-x inset-x-0 rounded-tl-sm', ['rounded-t-lg', 'size-4', 'border-x', 'inset-x-0']],
    ['shadow-red-500 shadow-md border-t-red-500', ['shadow-red-500', 'border-t-red-500']],
    ['[&>*]:p-4 md:lg:p-4 -pt-4', ['[&>*]:p-4', 'md:lg:p-4', '-pt-4']],
  ]
  for (const [className, expected] of cases) {
    it(`"${className}"`, () => {
      assert.deepEqual(unmanagedClasses(className), expected)
    })
  }
})

describe('variantsInUse', () => {
  const cases: Array<[string, string[]]> = [
    ['', []],
    ['p-4 flex', []],
    ['lg:p-4 md:p-2 hover:bg-red-500 md:hover:pt-1 md:flex', ['base/hover', 'md/default', 'md/hover', 'lg/default']],
    ['dark:p-4 md:foo group-hover:pt-2', []],
    ['md:rounded-t-lg', ['md/default']],
    ['focus:p-1 active:p-2 2xl:p-3', ['base/focus', 'base/active', '2xl/default']],
  ]
  for (const [className, expected] of cases) {
    it(`"${className}"`, () => {
      assert.deepEqual(
        variantsInUse(className).map((item) => `${item.breakpoint}/${item.state}`),
        expected,
      )
    })
  }
})
