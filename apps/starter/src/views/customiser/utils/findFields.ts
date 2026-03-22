import type { BlocksFieldClient, ClientField, TabsFieldClient } from 'payload'

/**
 * Find a blocks field by name, searching inside unnamed tabs.
 * Payload wraps user fields in tabs on the client when plugins add tabs (e.g. SEO).
 */
export function findBlocksField(fields: ClientField[], fieldName: string): BlocksFieldClient | undefined {
  for (const field of fields) {
    if ('name' in field && field.name === fieldName && field.type === 'blocks') {
      return field as BlocksFieldClient
    }
    if (field.type === 'tabs' && 'tabs' in field) {
      for (const tab of field.tabs) {
        const found = findBlocksField(tab.fields, fieldName)
        if (found) return found
      }
    }
  }
  return undefined
}

/**
 * Recursively strip blocks-type fields from a field array.
 * Handles blocks fields at the top level AND nested inside tabs/groups/rows/collapsibles.
 * Used by the right sidebar to show only the selected block's own settings/styles,
 * not its nested child blocks (which belong in the left tree view).
 */
export function stripBlocksFields(fields: ClientField[]): ClientField[] {
  return fields
    .filter((field) => field.type !== 'blocks')
    .map((field) => {
      if (field.type === 'tabs' && 'tabs' in field) {
        const filteredTabs = (field as TabsFieldClient).tabs
          .map((tab) => {
            const filtered = stripBlocksFields(tab.fields)
            return { ...tab, fields: filtered }
          })
          .filter((tab) => tab.fields.length > 0)

        if (filteredTabs.length === 0) return null

        return { ...field, tabs: filteredTabs } as ClientField
      }
      if (field.type === 'group' && 'fields' in field) {
        return { ...field, fields: stripBlocksFields(field.fields) } as ClientField
      }
      if (field.type === 'row' && 'fields' in field) {
        return { ...field, fields: stripBlocksFields(field.fields) } as ClientField
      }
      if (field.type === 'collapsible' && 'fields' in field) {
        return { ...field, fields: stripBlocksFields(field.fields) } as ClientField
      }
      return field
    })
    .filter(Boolean) as ClientField[]
}

/**
 * Collect non-layout fields from the same tab that contains the layout field.
 * Only extracts from the content tab — plugin tabs (e.g. SEO) have custom components
 * that rely on server-side Payload instances and break in the customizer context.
 */
export function getNonLayoutFields(fields: ClientField[], layoutFieldName: string): ClientField[] {
  const systemFields = new Set(['updatedAt', 'createdAt', 'deletedAt', '_status', 'id'])
  const result: ClientField[] = []

  for (const field of fields) {
    if (field.type === 'tabs' && 'tabs' in field) {
      // Only extract from the tab containing the layout field
      for (const tab of field.tabs) {
        const hasLayout = tab.fields.some(
          (f) => 'name' in f && f.name === layoutFieldName,
        )
        if (!hasLayout) continue
        for (const tabField of tab.fields) {
          if ('name' in tabField && tabField.name === layoutFieldName) continue
          result.push(tabField)
        }
      }
    } else if ('name' in field && systemFields.has(field.name)) {
      continue
    } else {
      result.push(field)
    }
  }

  return result
}
