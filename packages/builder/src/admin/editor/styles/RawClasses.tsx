'use client'

// Every class of the block in one editable field, with autocomplete from the theme's class list.
// Typed variant prefixes ("md:hover:") and "!" / "-" stay in front of the picked class.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { unmanagedClasses, type StyleTokens } from '../../../core'
import { useStyles } from './context'
import { ResetIcon } from './icons'
import { filterSuggestions, Popover, SuggestList, usePopover, type Suggestion } from './popover'

const classSuggestionCache = new WeakMap<StyleTokens, Suggestion[]>()

function classSuggestions(tokens: StyleTokens): Suggestion[] {
  let list = classSuggestionCache.get(tokens)
  if (!list) classSuggestionCache.set(tokens, (list = tokens.classList.map((value) => ({ value }))))
  return list
}

/** The word around the caret, split into its prefix ("md:hover:-") and the utility being typed. */
function wordAt(text: string, caret: number) {
  const start = text.slice(0, caret).search(/\S*$/)
  const after = text.slice(caret).search(/\s|$/)
  const end = caret + after
  const typed = text.slice(start, caret)
  const prefix = /^(?:[^\s:[\]]+:|!|-)*/.exec(typed)?.[0] ?? ''
  return { start, end, prefix, query: typed.slice(prefix.length) }
}

function safeUnmanaged(className: string, tokens: StyleTokens): string[] {
  try {
    return unmanagedClasses(className, tokens)
  } catch {
    return []
  }
}

export function RawClasses() {
  const { blockId, className, tokens, setClassName } = useStyles()
  const listId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pop = usePopover('manual', true)
  const [draft, setDraft] = useState<string | null>(null)
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)

  const text = draft ?? className
  const word = wordAt(text, caret)
  const all = classSuggestions(tokens)
  const items = useMemo(() => (word.query ? filterSuggestions(all, word.query, 60) : []), [all, word.query])
  const others = useMemo(() => safeUnmanaged(className, tokens), [className, tokens])

  const update = (next: string, nextCaret: number) => {
    setDraft(next)
    setCaret(nextCaret)
    setActive(0)
    setClassName(next, `className:${blockId}`)
  }

  const pick = (item: Suggestion) => {
    const rest = text.slice(word.end).replace(/^\s*/, '')
    const inserted = `${word.prefix}${item.value} `
    const next = `${text.slice(0, word.start)}${inserted}${rest}`
    const nextCaret = word.start + inserted.length
    update(next, nextCaret)
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(nextCaret, nextCaret))
  }

  const open = draft !== null && items.length > 0
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
      e.preventDefault()
      const item = items[active]
      if (item) pick(item)
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      setDraft(null)
    }
  }

  return (
    <div className="builder-styles__raw">
      <label className="builder-styles__raw-label" htmlFor={`${listId}-input`}>
        Classes
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
        onBlur={() => setDraft(null)}
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
            {others.map((name) => (
              <li key={name} className="builder-styles__class-chip">
                <code>{name}</code>
                <button
                  type="button"
                  className="builder-styles__reset"
                  title={`Remove ${name}`}
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
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
