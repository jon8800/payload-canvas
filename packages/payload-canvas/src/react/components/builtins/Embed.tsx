import { EMBED_CLASS_MAP as C, EMBED_LABELS, EMBED_SANDBOX, embedMode } from '../../../blocks/client/embed'
import { joinClasses, labelOf } from '../../../blocks/client/helpers'
import type { BlockComponentProps } from '../../render/types'
// The inline HTML and the canvas preview load their JavaScript only on pages that render them.
import { EmbedHtml, EmbedPreview } from '../lazy'
import { asText } from '../placeholder'

export type EmbedLabels = Partial<typeof EMBED_LABELS>

/**
 * Custom HTML. `inline`: the HTML is in the page, and its scripts run (`EmbedHtml`). `isolated`:
 * a sandboxed frame shows it, with no JavaScript of ours. Empty code renders nothing on the site.
 * The canvas never runs the code (`EmbedPreview`).
 */
export function Embed({ props, className, attributes, mode, labels }: BlockComponentProps & { labels?: EmbedLabels }) {
  const code = asText(props.code)
  const kind = embedMode(props.mode)
  const title = labelOf(props, labels ? { ...EMBED_LABELS, ...labels } : EMBED_LABELS, 'title')
  if (mode === 'canvas') return <EmbedPreview code={code} mode={kind} title={title} className={className} attributes={attributes} />
  if (!code.trim()) return null
  if (kind === 'inline') return <EmbedHtml html={code} className={className} attributes={attributes} />
  return <iframe {...attributes} className={joinClasses(C.frame, className)} title={title} srcDoc={code} sandbox={EMBED_SANDBOX} loading="lazy" />
}
