'use client'

import { useSyncExternalStore } from 'react'
import { filterHref } from '../../../blocks/client/filterLink'
import { textOr } from '../../../blocks/client/helpers'
import type { BlockComponentProps } from '../../render/types'

const subscribe = (onChange: () => void) => {
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}
const clientUrl = () => window.location.pathname + window.location.search
// The server does not know the URL: relative hrefs, nothing active until the client hydrates.
const serverUrl = () => null

/**
 * A link to the current page with one URL query value set, toggled or cleared. Before hydration
 * the href is relative (`?param=value`), so the link works and search engines can follow it.
 * After hydration it keeps the page's other query values and marks the current filter with
 * `aria-current="true"`.
 */
export function FilterLink({ props, className, attributes, partAttributes, slots }: BlockComponentProps) {
  const url = useSyncExternalStore(subscribe, clientUrl, serverUrl)
  const parsed = url === null ? null : new URL(url, 'http://localhost')
  const { href, active } = filterHref(parsed?.pathname ?? '', parsed?.searchParams ?? new URLSearchParams(), {
    param: textOr(props.param, ''),
    value: textOr(props.value, ''),
    multiple: props.multiple === true,
    // The page parameters of the layout's lists with their own `pageParam` (`withPageParams`).
    pageParams: Array.isArray(props.$pageParams) ? props.$pageParams.filter((item): item is string => typeof item === 'string') : [],
  })
  return (
    <a
      {...attributes}
      {...partAttributes.children}
      href={href}
      aria-current={url !== null && active ? 'true' : undefined}
      className={className}
    >
      {slots.children}
    </a>
  )
}
