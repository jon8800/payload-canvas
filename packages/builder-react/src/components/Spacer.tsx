import type { BlockComponentProps } from '../render/types'

/** Empty space. Its height comes from `className`. Without one, the canvas still gives it some height. */
export function Spacer({ className, attributes, mode }: BlockComponentProps) {
  const style = mode === 'canvas' && !className ? { minHeight: 16 } : undefined
  return <div {...attributes} aria-hidden="true" className={className} style={style} />
}
