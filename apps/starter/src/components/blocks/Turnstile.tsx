'use client'

// The Cloudflare Turnstile check of a form. Loads Cloudflare's script once per page, renders the
// widget into its own element and reports the token. `resetKey` changes after a failed submit:
// a token works only once, so the widget asks again.
import { useEffect, useRef } from 'react'

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let loading: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.addEventListener('load', () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load'))))
    script.addEventListener('error', () => {
      loading = null
      reject(new Error('Turnstile did not load'))
    })
    document.head.appendChild(script)
  })
  return loading
}

export function Turnstile({ siteKey, resetKey, onToken }: { siteKey: string; resetKey: number; onToken: (token: string | null) => void }) {
  const element = useRef<HTMLDivElement>(null)
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null)
  const report = useRef(onToken)
  useEffect(() => {
    report.current = onToken
  })

  useEffect(() => {
    let cancelled = false
    loadTurnstile()
      .then((api) => {
        if (cancelled || !element.current) return
        const id = api.render(element.current, {
          sitekey: siteKey,
          callback: (token: string) => report.current(token),
          'expired-callback': () => report.current(null),
          'error-callback': () => report.current(null),
        })
        widget.current = { api, id }
      })
      .catch(() => report.current(null))
    return () => {
      cancelled = true
      if (widget.current) widget.current.api.remove(widget.current.id)
      widget.current = null
    }
  }, [siteKey])

  useEffect(() => {
    if (resetKey === 0 || !widget.current) return
    widget.current.api.reset(widget.current.id)
    report.current(null)
  }, [resetKey])

  return <div ref={element} />
}
