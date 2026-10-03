'use client'

import { RenderLexical } from '@payloadcms/richtext-lexical/client'

import { richTextFieldName } from '../../../core/blocks'
import { useRuntime } from '../runtime'

type Props = {
  readonly label: string
  readonly path: string
  readonly value: unknown
  readonly onChange: (value: unknown) => void
}

/**
 * Payload's own Lexical editor, outside Payload's form. It takes its editor config (features)
 * from the hidden virtual richText field the plugin adds to the collection.
 *
 * Lexical keeps its own state and reports changes after a short idle delay. A value that
 * deep-equals the last one it reported does not reset it, so typing survives autosave.
 * A different value (undo, AI edit) re-mounts the editor with that value.
 */
export function RichTextField({ label, path, value, onChange }: Props) {
  const { config } = useRuntime()
  const name = richTextFieldName(config.field)
  return (
    <div className="builder-field-richtext">
      <RenderLexical
        label={label}
        name={name}
        path={path}
        schemaPath={`collection.${config.collection}.${name}`}
        setValue={(next) => onChange(next ?? null)}
        value={(value ?? undefined) as never}
      />
    </div>
  )
}
