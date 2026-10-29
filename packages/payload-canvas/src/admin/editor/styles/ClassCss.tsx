'use client'

// The edited class's custom CSS: declarations and nested rules inside the class rule, for what
// Tailwind classes cannot express. Each change applies on the canvas at once; publishing checks it.

import { useId } from 'react'

import { cssProblem, type BuilderClass } from '../../../classes/shared'
import { useRuntime } from '../runtime'

const PLACEHOLDER = `background: linear-gradient(135deg, …), radial-gradient(…);
&::before {
  content: "";
}`

export function ClassCss({ item }: { item: BuilderClass }) {
  const runtime = useRuntime()
  const id = useId()
  const value = item.css ?? ''
  const problem = cssProblem(value)

  return (
    <div className="builder-classes__css">
      <label className="builder-styles__raw-label" htmlFor={id}>
        Custom CSS
      </label>
      <textarea
        id={id}
        className="builder-styles__raw-input builder-classes__css-input"
        rows={5}
        value={value}
        spellCheck={false}
        autoComplete="off"
        placeholder={PLACEHOLDER}
        aria-describedby={`${id}-hint`}
        aria-invalid={problem ? true : undefined}
        onChange={(e) => runtime.classes?.edit(item.id, 'css', e.target.value, `class:${item.id}:css`)}
        onKeyDown={(e) => {
          // Tab indents (two spaces) instead of leaving the box.
          if (e.key !== 'Tab' || e.shiftKey) return
          e.preventDefault()
          const el = e.currentTarget
          const { selectionStart: start, selectionEnd: end } = el
          const next = `${el.value.slice(0, start)}  ${el.value.slice(end)}`
          runtime.classes?.edit(item.id, 'css', next, `class:${item.id}:css`)
          requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2))
        }}
      />
      <p id={`${id}-hint`} className={`builder-styles__hint${problem ? ' builder-styles__hint--error' : ''}`}>
        {problem ?? 'Inside the class rule: declarations, nested rules such as “&:hover { … }” or “&::before { … }”, and @keyframes.'}
      </p>
    </div>
  )
}
