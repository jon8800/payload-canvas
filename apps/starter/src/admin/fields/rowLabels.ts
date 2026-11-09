import type { Plugin } from 'payload'

import { setAdminComponent, walkFields } from './walkFields'

const ROW_LABEL = 'payload-canvas/client#ArrayRowLabel'

/**
 * Names array rows by their content in every collection, global and block: "Sales team (sales)"
 * instead of "Item 01". Arrays with their own `admin.components.RowLabel` keep it. The rule is
 * `rowLabel` from `payload-canvas/core`, the same one the builder's inspector uses.
 */
export function rowLabels(): Plugin {
  return (config) => {
    walkFields(config, (field) => {
      if (field.type === 'array') setAdminComponent(field, 'RowLabel', ROW_LABEL)
    })
    return config
  }
}
