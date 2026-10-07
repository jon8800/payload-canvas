import type { BlockComponentProps } from '../render/types'

export function Divider({ className, attributes }: BlockComponentProps) {
  return <hr {...attributes} className={className} />
}
