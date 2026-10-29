'use client'

// Every class of the block in one editable field, with autocomplete from the theme's class list.
// The site's own classes come first, with their labels; the field lists them when it gets the
// focus or after a typed variant ("md:"). Typed variant prefixes ("md:hover:") and "!" / "-" stay
// in front of the picked class.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { unmanagedClasses, type StyleTokens } from '../../../core'
import { useStyles } from './context'
import { ResetIcon } from './icons'
import { Popover, SuggestList, usePopover, type Suggestion } from './popover'
import { classSuggestions, siteClassOf } from './suggestions'

/** The word around the caret, split into its prefix ("md:hover:-") and the utility being typed. */
function wordAt(text: string, caret: number) {
  const start = text.slice(0, caret).search(/\S*$/)
  const after = text.slice(caret).search(/\s|$/)
  const end = caret + after
  const typed = text.slice(start, caret)
  const prefix = /^(?:[^\s:[\]]+:|!|-)*/.exec(typed)?.[0] ?? ''
  return { start, end, prefix, query: typed.slice(prefix.length) }
}

type Known = { names: Set<string>; numericStems: Set<string> }
const knownCache = new WeakMap<StyleTokens, Known>()
const NUMERIC = /^(.*)-\d+(?:\.\d+)?$/

function knownClasses(tokens: StyleTokens): Known {
  let known = knownCache.get(tokens)
  if (known) return known
  const numericStems = new Set<string>()
  for (const name of tokens.classList) {
    const stem = NUMERIC.exec(name)?.[1]
    if (stem) numericStems.add(stem)
  }
  // The site's own classes count too (editable classes are in no Tailwind class list).
  known = { names: new Set([...tokens.classList, ...(tokens.siteClasses ?? []).map((c) => c.name)]), numericStems }
  knownCache.set(tokens, known)
  return known
}

/**
 * True when Tailwind has no utility with this name, so the class does nothing. Variant prefixes,
 * "!" and "-" are ignored. Arbitrary values ("bg-[#fff]") and fractions count as known. Without a
 * class list from the theme, every class counts as known.
 */
export function isUnknownClass(name: string, tokens: StyleTokens): boolean {
  if (tokens.classList.length === 0) return false
  const known = knownClasses(tokens)
  const utility = name.replace(/^(?:[^\s:[\]]+:)*/, '').replace(/^!|!$/g, '').replace(/^-/, '')
  if (!utility || utility.includes('[') || utility.includes('/')) return false
  if (known.names.has(utility)) return false
  // Any number on a numeric scale works in Tailwind 4 ("p-13"), even when the list stops earlier.
  const stem = NUMERIC.exec(utility)?.[1]
  return !(stem && known.numericStems.has(stem))
}

function safeUnmanaged(className: string, tokens: StyleTokens): string[] {
  try {
    return unmanagedClasses(className, tokens)
  } catch {
    return []
  }
}

export function RawClasses() {
  const { blockId, className, tokens, setClassName, editingClass } = useStyles()
  const listId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pop = usePopover('manual', true)
  const [draft, setDraft] = useState<string | null>(null)
  const [caret, setCaret] = useState(0)
  // -1: no item is chosen yet, so Enter and Tab keep their usual job.
  const [active, setActive] = useState(0)
  // The field got the focus: it lists the site classes until the user types or picks one.
  const [browse, setBrowse] = useState(false)

  const text = draft ?? className
  const word = wordAt(text, caret)
  const listSite = !word.query && (browse || (draft !== null && word.prefix !== ''))
  const own = useMemo(() => new Set(className.split(/\s+/)), [className])
  const items = useMemo(
    () => (word.query || listSite ? classSuggestions(tokens, word.query, 60, own) : []),
    [tokens, word.query, listSite, own],
  )
  const others = useMemo(() => safeUnmanaged(className, tokens), [className, tokens])

  const update = (next: string, nextCaret: number) => {
    setDraft(next)
    setCaret(nextCaret)
    setActive(0)
    setBrowse(false)
    setClassName(next, `className:${blockId}`)
  }

  // The picked class replaces the word at the caret, with the word's variant prefix. With the
  // caret inside a class and nothing typed, it goes at the end instead, so no class is lost.
  const pick = (item: Suggestion) => {
    const inserted = `${word.prefix}${item.value} `
    const append = !word.query && !word.prefix && word.end > caret
    const head = append ? `${text.trimEnd()}${text.trim() ? ' ' : ''}` : text.slice(0, word.start)
    const rest = append ? '' : text.slice(word.end).replace(/^\s*/, '')
    const next = `${head}${inserted}${rest}`
    const nextCaret = head.length + inserted.length
    update(next, nextCaret)
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(nextCaret, nextCaret))
  }

  const open = (draft !== null || browse) && items.length > 0
  const { show, hide } = pop
  useEffect(() => {
    const el = inputRef.current
    if (open && el && document.activeElement === el) show(el)
    else hide()
  }, [open, show, hide])

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) {
      // Enter applies the field (no line breaks in a class list).
      if (e.key === 'Enter') e.preventDefault()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => Math.max(0, Math.min(items.length - 1, i + step)))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      const item = items[active]
      if (e.key === 'Enter' || item) e.preventDefault()
      if (item) pick(item)
      else setBrowse(false)
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      setDraft(null)
      setBrowse(false)
    }
  }

  return (
    <div className="builder-styles__raw">
      <label className="builder-styles__raw-label" htmlFor={`${listId}-input`}>
        {editingClass ? `Classes of .${editingClass.name}` : 'Classes'}
      </label>
      <textarea
        id={`${listId}-input`}
        ref={inputRef}
        className="builder-styles__raw-input"
        rows={3}
        value={text}
        spellCheck={false}
        autoComplete="off"
        placeholder="bg-red-500 p-8 md:flex"
        onChange={(e) => update(e.target.value.replace(/\n/g, ' '), e.target.selectionStart)}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onFocus={(e) => {
          setCaret(e.currentTarget.selectionStart)
          setActive(-1)
          setBrowse(true)
        }}
        onBlur={() => {
          setDraft(null)
          setBrowse(false)
        }}
        onKeyDown={onKeyDown}
      />
      <Popover {...pop.props} className="builder-styles__popover--list">
        <div id={listId}>
          {open && pop.open && <SuggestList items={items} active={active} onHover={setActive} onPick={pick} />}
        </div>
      </Popover>
      {others.length > 0 && (
        <div className="builder-styles__others">
          <span className="builder-styles__raw-label">Other classes</span>
          <ul className="builder-styles__chips">
            {others.map((name) => {
              const unknown = isUnknownClass(name, tokens)
              // A site class shows its label, with the class name small after it.
              const site = siteClassOf(name, tokens.siteClasses)
              const tooltip = unknown
                ? `“${name}” is not in the theme’s class list, so it may have no effect. Check the spelling.`
                : site?.site.css
                  ? `.${site.site.name} { ${site.site.css} }`
                  : undefined
              return (
              <li
                key={name}
                className={`builder-styles__class-chip${unknown ? ' builder-styles__class-chip--unknown' : ''}`}
                data-tooltip={tooltip}
              >
                {unknown && <span className="builder-styles__visually-hidden">Unknown class: </span>}
                {site?.site.label ? (
                  <span className="builder-styles__class-chip-label">
                    {site.prefix}
                    {site.site.label} <code className="builder-styles__suggest-name">{site.site.name}</code>
                  </span>
                ) : (
                  <code>{name}</code>
                )}
                <button
                  type="button"
                  className="builder-styles__reset"
                  aria-label={`Remove ${name}`}
                  onClick={() =>
                    setClassName(
                      className
                        .split(/\s+/)
                        .filter((c) => c && c !== name)
                        .join(' '),
                    )
                  }
                >
                  <ResetIcon />
                </button>
              </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
