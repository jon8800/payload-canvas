'use client'

// The Submit button block (payload-canvas `formBlocks()`): the button that sends the Form block it
// sits in, with the spam check (Cloudflare Turnstile, when the form uses it) and the reason of a
// refused submission above it. Its own classes go on the row around the button; the button takes
// its `button` part classes, else the form's button classes, else the default look.
import type { BlockComponentProps } from 'payload-canvas/react'
import { SubmitButton, join } from './FormParts'
import { useFormRuntime } from './FormRuntime'
import { Turnstile } from './Turnstile'
import { formClasses } from './formClasses'

type ContentProps = {
  /** The block's own label; empty: the form's submit button label. */
  label: unknown
  className?: string
  attributes?: Record<string, string>
  /** The button's own classes (the block's `button` part). */
  buttonClassName?: string
}

/** The row with the check, the problems of a refused submission and the button. */
export function SubmitContent({ label, className, attributes, buttonClassName }: ContentProps) {
  const runtime = useFormRuntime()
  const text = (typeof label === 'string' && label.trim()) || runtime?.submitLabel
  const failure = runtime?.failure
  return (
    <div {...attributes} className={join(formClasses.footer, className)}>
      {runtime?.siteKey ? <Turnstile siteKey={runtime.siteKey} resetKey={runtime.turnstileReset} onToken={runtime.setToken} /> : null}
      {failure ? (
        <div className={formClasses.error} role="alert">
          {failure.problems.length > 0 ? (
            <>
              <p className={formClasses.errorText}>Your message was not sent. Fix this and try again:</p>
              <ul className={formClasses.errorList}>
                {failure.problems.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className={formClasses.errorText}>{failure.message}</p>
          )}
        </div>
      ) : null}
      <SubmitButton label={text} submitting={runtime?.submitting} preview={!runtime || runtime.preview} className={buttonClassName ?? runtime?.parts.button} />
    </div>
  )
}

/** Block component of the Submit button block. */
export function FormSubmitBlock({ props, className, attributes, partAttributes }: BlockComponentProps) {
  return <SubmitContent label={props.label} className={className} attributes={attributes} buttonClassName={partAttributes?.button?.className} />
}
