'use client'

import type { DefaultCellComponentProps } from 'payload'

/** The templates list's "Default template" column: "Default" or a dash, not "true" / "false". */
export function TemplateDefaultCell({ cellData }: DefaultCellComponentProps) {
  return <span>{cellData === true ? 'Default' : '—'}</span>
}
