// Page regions on the site and in the canvas (the collection's `regions` option). Plain module:
// server components read these constants, so they must not live in a 'use client' file.

import type { ReactNode } from 'react'

/** The attribute that marks a region's element in the canvas. Its value is the region name. */
export const REGION_ATTRIBUTE = 'data-builder-region'

/** The attribute of the canvas element that holds the live layout inside the page frame. */
export const LAYOUT_ROOT_ATTRIBUTE = 'data-builder-layout'

/**
 * Marks the part of the page frame that shows a region: `region('header', <Header … />)`. In the
 * canvas it puts the region's attribute on the first element of `node` (no extra element), so the
 * editor can select it. On the site it returns `node` as it is.
 */
export type RegionMark = (name: string, node: ReactNode) => ReactNode

/** The site's `region`: the node as it is. Pass it to the page frame on the site. */
export const siteRegion: RegionMark = (_name, node) => node
