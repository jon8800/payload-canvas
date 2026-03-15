import type { JSONField } from 'payload'

/**
 * Styles JSON field factory.
 *
 * Returns a single Payload `json` field that stores the full StylesData object.
 * The admin UI is a custom bounding-box panel (StylesPanel) that lets editors
 * visually configure spacing, border, typography, colors, and custom CSS.
 */
export function stylesField(overrides?: Partial<JSONField>): JSONField {
  return {
    name: 'styles',
    type: 'json',
    label: 'Styles',
    admin: {
      components: {
        Field: '/components/admin/StylesPanel.tsx#StylesPanel',
      },
    },
    ...overrides,
  }
}
