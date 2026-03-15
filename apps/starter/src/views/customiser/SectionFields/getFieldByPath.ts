import { ClientField } from 'payload'

type FieldWithBlocks = ClientField & {
  blocks?: Array<{
    slug: string
    fields: ClientField[]
  }>
}

type NamedField = ClientField & {
  name: string
}

const getFieldByPath = (
  fields: ClientField[],
  segments: string[],
  currentIndex: number = 0,
): { field: ClientField; blockType?: string } | null => {
  if (currentIndex >= segments.length) {
    return null
  }

  const segment = segments[currentIndex]
  const isIndex = !isNaN(Number(segment))

  if (isIndex) {
    const blocksField = fields.find(
      (f): f is FieldWithBlocks => f.type === 'blocks' && 'blocks' in f,
    )

    if (!blocksField?.blocks) {
      return null
    }

    const blockIndex = parseInt(segment, 10)
    const block = blocksField.blocks[blockIndex]

    if (!block) {
      return null
    }

    if (currentIndex + 1 < segments.length) {
      return getFieldByPath(block.fields, segments, currentIndex + 1)
    }

    return { field: blocksField, blockType: block.slug }
  }

  const field = fields.find((f): f is NamedField => 'name' in f && f.name === segment)

  if (!field) {
    return null
  }

  if (currentIndex === segments.length - 1) {
    return { field }
  }

  if (field.type === 'blocks' && 'blocks' in field) {
    const blocksField = field as FieldWithBlocks
    const nextSegment = segments[currentIndex + 1]

    if (!nextSegment || !blocksField.blocks) {
      return null
    }

    const block = blocksField.blocks.find((b) => b.slug === nextSegment)
    if (!block) {
      return null
    }

    return getFieldByPath(block.fields, segments, currentIndex + 2)
  } else if ('fields' in field) {
    return getFieldByPath(field.fields, segments, currentIndex + 1)
  }

  return null
}

export const getBlockFieldByPath = ({
  fields,
  path,
}: {
  fields: ClientField[]
  path: string | null | undefined
}): {
  field: ClientField
  blockType?: string
} | null => {
  if (!path) {
    return null
  }

  const segments = path.split('.')
  let currentFields: ClientField[] = fields
  let currentField: ClientField | null = null
  let blockType: string | undefined

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const isIndex = !isNaN(Number(segment))

    if (isIndex) {
      const blocksField = currentFields.find(
        (f): f is FieldWithBlocks => f.type === 'blocks' && 'blocks' in f,
      )

      if (!blocksField?.blocks) {
        return null
      }

      const blockIndex = parseInt(segment, 10)
      const block = blocksField.blocks[blockIndex]

      if (!block) {
        return null
      }

      currentField = blocksField
      blockType = block.slug
      currentFields = block.fields
      continue
    }

    const field = currentFields.find((f): f is NamedField => 'name' in f && f.name === segment)

    if (!field) {
      return null
    }

    currentField = field

    if (field.type === 'blocks' && 'blocks' in field) {
      const blocksField = field as FieldWithBlocks
      const nextSegment = segments[i + 1]

      if (!nextSegment || !blocksField.blocks) {
        return null
      }

      const block = blocksField.blocks.find((b) => b.slug === nextSegment)
      if (!block) {
        return null
      }

      currentFields = block.fields
      blockType = nextSegment
      i++
    } else if ('fields' in field) {
      currentFields = field.fields
    } else if (i < segments.length - 1) {
      return null
    }
  }

  if (!currentField) {
    return null
  }

  return {
    field: currentField,
    blockType,
  }
}
