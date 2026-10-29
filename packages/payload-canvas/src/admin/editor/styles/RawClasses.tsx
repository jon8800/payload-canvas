'use client'

// The classes field of the Styles panel (`ClassChips`), like the ".cls" field of Chrome DevTools:
//
// - editable classes (the `builder-classes` collection) are solid chips. A click makes the style
//   controls edit that class (`onSelect`); a second click goes back to the block.
// - the classes no style control shows ("dark:pt-4", a code `@utility` class) are quiet chips in
//   monospace. A click edits one in place; × removes it.
// - the input at the end adds classes, with the site's classes and Tailwind's as suggestions.
//
// The classes the controls show (p-4, md:flex) have no chips: the controls show them. `ClassText`
// edits the whole class string as text instead ("Edit as text" in the field's menu).

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { bareClass, classTokens, type BuilderClass } from '../../../classes/shared'
import { unmanagedClasses, type StyleTokens } from '../../../core'
import { changeClasses, replaceToken } from './classEdit'
import { useStyles } from './context'
import { ResetIcon } from './icons'
import { Popover, SuggestList, usePopover, type Suggestion } from './popover'
import { classSuggestions, siteClassOf } from './suggestions'

/** Variant prefixes ("md:hover:"), "!" and "-" in front of the utility being typed. */
const PREFIX = /^(?:[^\s:[\]]+:|!|-)*/

/** The word around the caret, split into its prefix ("md:hover:-") and the utility being typed. */
function wordAt(text: string, caret: number) {
  const start = text.slice(0, caret).search(/\S*$/)
  const after = text.slice(caret).search(/\s|$/)
  const end = caret + after
  const typed = text.slice(start, caret)
  const prefix = PREFIX.exec(typed)?.[0] ?? ''
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

/** True when the class token uses the editable class (also by a former name). */
const isClassOf = (token: string, item: BuilderClass) => {
  const name = bareClass(token)
  return name === item.name || Boolean(item.previousNames?.includes(name))
}

type ChipsProps = {
  /** The class string the field shows and changes. */
  value: string
  onChange: (next: string) => void
  /** Names the field for screen readers, e.g. "Classes of this block". */
  label: string
  /** Where the classes go, for the remove buttons: "this block", ".card". */
  owner: string
  /** The editable classes in `value`: solid chips. */
  editable?: readonly BuilderClass[]
  /** The editable class the style controls edit, or null. */
  selected?: BuilderClass | null
  onSelect?: (item: BuilderClass | null) => void
}

export function ClassChips({ value, onChange, label, owner, editable = [], selected = null, onSelect }: ChipsProps) {
  const { tokens } = useStyles()
  // Quiet chips: the classes no control shows, without the editable ones (those are solid chips).
  const quiet = useMemo(
    () => safeUnmanaged(value, tokens).filter((token) => !editable.some((item) => isClassOf(token, item))),
    [value, tokens, editable],
  )

  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a fieldset would add a legend and a border here
    <div className="builder-classfield" role="group" aria-label={label}>
      {editable.map((item) => {
        const pressed = selected?.id === item.id
        return (
          <span key={item.id} className="builder-classfield__chip builder-classfield__chip--class" data-selected={pressed || undefined}>
            <button
              type="button"
              className="builder-classfield__chip-main"
              aria-pressed={pressed}
              data-tooltip={pressed ? `Stop editing .${item.name}` : `Edit .${item.name}. It changes every block that uses it.`}
              onClick={() => onSelect?.(pressed ? null : item)}
            >
              <span className="builder-classfield__chip-name">{item.label || item.name}</span>
              {item.status === 'draft' && <span className="builder-classfield__draft-dot" aria-label="unpublished changes" />}
            </button>
            <button
              type="button"
              className="builder-classfield__remove"
              aria-label={`Remove .${item.name} from ${owner}`}
              onClick={() => {
                if (pressed) onSelect?.(null)
                onChange(changeClasses(value, (token) => isClassOf(token, item)))
              }}
            >
              <ResetIcon />
            </button>
          </span>
        )
      })}
      {quiet.map((token) => (
        <QuietChip key={token} token={token} owner={owner} onReplace={(next) => onChange(replaceToken(value, token, next))} />
      ))}
      <AddClass
        present={value}
        hasChips={editable.length + quiet.length > 0}
        onAdd={(names) => onChange(changeClasses(value, () => false, names))}
      />
    </div>
  )
}

/** A class no control shows. A click edits it in place: Enter or leaving the field keeps the change, Escape drops it. */
function QuietChip({ token, owner, onReplace }: { token: string; owner: string; onReplace: (next: string) => void }) {
  const { tokens } = useStyles()
  const [draft, setDraft] = useState<string | null>(null)
  // The edit ends once: Enter or Escape removes the input, and a blur may follow.
  const ended = useRef(false)
  const unknown = isUnknownClass(token, tokens)
  // A site class shows its label, with the class name small after it.
  const site = siteClassOf(token, tokens.siteClasses)
  const tooltip = unknown
    ? `“${token}” is not in the theme’s class list, so it may have no effect. Check the spelling.`
    : site?.site.css
      ? `.${site.site.name} { ${site.site.css} }`
      : 'Click to edit'

  if (draft !== null) {
    const done = (keep: boolean) => {
      if (ended.current) return
      ended.current = true
      setDraft(null)
      if (keep && draft.trim() !== token) onReplace(draft.trim())
    }
    return (
      <input
        className="builder-classfield__edit"
        aria-label={`Edit class ${token}`}
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the input replaces the chip the user just clicked
        autoFocus
        value={draft}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => done(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            done(true)
          } else if (e.key === 'Escape') {
            e.stopPropagation()
            done(false)
          }
        }}
      />
    )
  }

  return (
    <span className="builder-classfield__chip builder-classfield__chip--raw" data-unknown={unknown || undefined}>
      <button
        type="button"
        className="builder-classfield__chip-main"
        data-tooltip={tooltip}
        onClick={() => {
          ended.current = false
          setDraft(token)
        }}
      >
        {unknown && <span className="builder-styles__visually-hidden">Unknown class: </span>}
        {site?.site.label ? (
          <span className="builder-classfield__chip-name">
            {site.prefix}
            {site.site.label} <span className="builder-classfield__chip-code">{site.site.name}</span>
          </span>
        ) : (
          <span className="builder-classfield__chip-name">{token}</span>
        )}
      </button>
      <button type="button" className="builder-classfield__remove" aria-label={`Remove ${token} from ${owner}`} onClick={() => onReplace('')}>
        <ResetIcon />
      </button>
    </span>
  )
}

/**
 * The input at the end of the field. Enter, Tab on a suggestion, or a space adds what is typed;
 * pasted lists add every class. A typed variant prefix ("md:") stays in front of the picked class.
 */
function AddClass({ present, hasChips, onAdd }: { present: string; hasChips: boolean; onAdd: (names: string[]) => void }) {
  const { tokens } = useStyles()
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const pop = usePopover('manual', true)
  const [text, setText] = useState('')
  // The suggestion the arrow keys chose. Null: while typing, the class typed (when it is in the
  // list) or else the first suggestion; with nothing typed, none, so Enter does nothing.
  const [chosen, setChosen] = useState<number | null>(null)
  const [focused, setFocused] = useState(false)

  const prefix = PREFIX.exec(text)?.[0] ?? ''
  const query = text.slice(prefix.length)
  const own = useMemo(() => new Set(classTokens(present).map(bareClass)), [present])
  // Focused and empty (or only a variant typed): the site's own classes, to browse.
  const items = useMemo(() => (focused ? classSuggestions(tokens, query, 60, own) : []), [focused, tokens, query, own])
  const exact = items.findIndex((item) => item.value === query)
  const active = chosen ?? (query ? Math.max(0, exact) : -1)

  const open = focused && items.length > 0
  const { show, hide } = pop
  useEffect(() => {
    const el = inputRef.current
    if (open && el) show(el)
    else hide()
  }, [open, show, hide])

  const add = (names: string[]) => {
    const list = names.map((n) => n.trim()).filter(Boolean)
    if (list.length > 0) onAdd(list)
    setText('')
    setChosen(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && open) {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setChosen(Math.max(0, Math.min(items.length - 1, active + step)))
    } else if (e.key === 'Enter' || (e.key === 'Tab' && active >= 0 && open)) {
      e.preventDefault()
      const item = open ? items[active] : undefined
      add([item ? `${prefix}${item.value}` : text])
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      if (text) setText('')
      else inputRef.current?.blur()
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        className="builder-classfield__input"
        role="combobox"
        aria-label="Add a class"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={text}
        spellCheck={false}
        autoComplete="off"
        placeholder={hasChips ? 'Add' : 'Add a class'}
        onChange={(e) => {
          // A space ends a class: the words before it are added, the rest stays typed.
          const parts = e.target.value.split(/\s+/)
          const rest = parts.pop() ?? ''
          if (parts.some(Boolean)) add(parts)
          setText(rest)
          setChosen(null)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          setChosen(null)
        }}
        onKeyDown={onKeyDown}
      />
      <Popover {...pop.props} className="builder-styles__popover--list">
        <div id={listId}>
          {open && pop.open && (
            <SuggestList items={items} active={active} onHover={setChosen} onPick={(item: Suggestion) => add([`${prefix}${item.value}`])} />
          )}
        </div>
      </Popover>
    </>
  )
}

/**
 * The whole class string as text, with autocomplete ("Edit as text" in the field's menu). Typed
 * variant prefixes ("md:hover:") and "!" / "-" stay in front of the picked class.
 */
export function ClassText({ value, onChange, label }: { value: string; onChange: (next: string, mergeKey?: string) => void; label: string }) {
  const { blockId, tokens } = useStyles()
  const listId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pop = usePopover('manual', true)
  const [draft, setDraft] = useState<string | null>(null)
  const [caret, setCaret] = useState(0)
  // -1: no item is chosen yet, so Enter and Tab keep their usual job.
  const [active, setActive] = useState(0)
  // The field got the focus: it lists the site classes until the user types or picks one.
  const [browse, setBrowse] = useState(false)

  const text = draft ?? value
  const word = wordAt(text, caret)
  const listSite = !word.query && (browse || (draft !== null && word.prefix !== ''))
  const own = useMemo(() => new Set(value.split(/\s+/)), [value])
  const items = useMemo(
    () => (word.query || listSite ? classSuggestions(tokens, word.query, 60, own) : []),
    [tokens, word.query, listSite, own],
  )

  const update = (next: string, nextCaret: number) => {
    setDraft(next)
    setCaret(nextCaret)
    setActive(0)
    setBrowse(false)
    onChange(next, `className:${blockId}`)
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
    <>
      <textarea
        ref={inputRef}
        aria-label={label}
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
        <div id={listId}>{open && pop.open && <SuggestList items={items} active={active} onHover={setActive} onPick={pick} />}</div>
      </Popover>
    </>
  )
}
