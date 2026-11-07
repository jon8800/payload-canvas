// Server-only: the stylesheet of the published editable classes, for the site's `<head>`.
import type { Payload } from 'payload'
import { cache } from 'react'

import { classesConfigOf } from '../../classes/config'
import { loadClassesSheet as loadStoredSheet, type StoredClassSheet } from '../../classes/sheet'

/**
 * React precedence group of the classes stylesheet. React puts it in the `<head>` in the order it
 * first meets each group: render `ClassesStyle` after the site's CSS and `ThemeStyle`, so the
 * classes override code `@utility` rules with the same name. The page's generated CSS (a `<style>`
 * in the body) comes later still, so a block's own classes beat its class.
 */
export const CLASSES_PRECEDENCE = 'payload-canvas-classes'

/** The stored stylesheet, read once per request (React `cache`). `null` with `classes: false`. */
export const loadClassesSheet = cache(async (payload: Payload): Promise<StoredClassSheet | null> => loadStoredSheet(payload))

export type ClassesStyleProps = {
  payload: Payload
  /**
   * `link` (default): a `<link>` to `{api}/builder/classes-sheet/<hash>.css`, cached by the browser
   * for a year and shared by every page; a publish changes the hash. `inline`: the CSS in a
   * `<style>` tag in every page (no extra request, no browser cache).
   */
  mode?: 'link' | 'inline'
  /** Origin to put before the API path, for a site on another host than Payload. Default: none (same origin). */
  origin?: string
}

/**
 * The editable classes for the site's `<head>`. Put it in the root layout after `ThemeStyle`.
 * Renders nothing without published classes or with `classes: false`.
 */
export async function ClassesStyle({ payload, mode = 'link', origin = '' }: ClassesStyleProps) {
  const config = classesConfigOf(payload)
  const sheet = config ? await loadClassesSheet(payload) : null
  if (!config || !sheet?.css || !sheet.hash) return null
  if (mode === 'inline') {
    return (
      <style href={`${CLASSES_PRECEDENCE}-${sheet.hash}`} precedence={CLASSES_PRECEDENCE}>
        {sheet.css}
      </style>
    )
  }
  return <link rel="stylesheet" href={`${origin}${config.sheetPath}/${sheet.hash}.css`} precedence={CLASSES_PRECEDENCE} />
}
