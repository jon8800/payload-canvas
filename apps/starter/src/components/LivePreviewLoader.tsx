'use client'

// The live preview listener in a chunk of its own. Pages render it only in draft mode, but a page
// ships every client component its modules import, so a static import would put Payload's live
// preview code on every page.
import dynamic from 'next/dynamic'

export const LivePreviewListener = dynamic(() => import('./LivePreviewListener').then((module) => module.LivePreviewListener))
