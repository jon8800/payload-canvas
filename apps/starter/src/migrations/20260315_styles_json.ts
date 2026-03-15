import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * Migration: Consolidate per-field style data into single `styles` JSON field.
 *
 * Before: style fields (padding, margin, borderRadius, etc.) live at the block root level.
 * After:  all style data is nested under a single `styles` JSON field on each block.
 *
 * Also merges old settingsTab fields (customClasses, inlineCSS) into styles.customCSS.
 */

const STYLE_FIELDS = [
  'padding',
  'margin',
  'borderRadius',
  'borderWidth',
  'textSize',
  'backgroundColor',
  'textColor',
  'customCSS',
] as const

type Block = Record<string, unknown>

/**
 * Recursively migrate blocks from old per-field format to new styles JSON format.
 * Returns true if any changes were made.
 */
function migrateBlocksUp(blocks: Block[]): boolean {
  let changed = false

  for (const block of blocks) {
    // Skip if already migrated
    if (block.styles) continue

    // Check if any old style fields exist at root
    const hasOldFields = STYLE_FIELDS.some((field) => block[field] !== undefined)
    const hasSettingsFields =
      block.customClasses !== undefined || block.inlineCSS !== undefined

    if (hasOldFields || hasSettingsFields) {
      const styles: Record<string, unknown> = {}

      // Move each style field into the styles object
      for (const field of STYLE_FIELDS) {
        if (block[field] !== undefined) {
          styles[field] = block[field]
          delete block[field]
        }
      }

      // Merge old settingsTab customClasses into styles.customCSS.classes
      if (block.customClasses !== undefined) {
        const customCSS = (styles.customCSS as Record<string, unknown>) ?? {}
        const existingClasses =
          typeof customCSS.classes === 'string' ? customCSS.classes : ''
        const extraClasses =
          typeof block.customClasses === 'string' ? block.customClasses : ''

        if (extraClasses) {
          // Merge classes, avoiding duplicates
          const classSet = new Set(
            [existingClasses, extraClasses]
              .filter(Boolean)
              .join(' ')
              .split(/\s+/)
              .filter(Boolean),
          )
          customCSS.classes = [...classSet].join(' ')
        }

        styles.customCSS = customCSS
        delete block.customClasses
      }

      // Merge old settingsTab inlineCSS into styles.customCSS.inlineCSS
      if (block.inlineCSS !== undefined) {
        const customCSS = (styles.customCSS as Record<string, unknown>) ?? {}
        const existingInline =
          typeof customCSS.inlineCSS === 'string' ? customCSS.inlineCSS : ''
        const extraInline =
          typeof block.inlineCSS === 'string' ? block.inlineCSS : ''

        if (extraInline) {
          const parts = [existingInline, extraInline].filter(Boolean)
          customCSS.inlineCSS = parts.join('; ').replace(/;;\s*/g, '; ').trim()
        }

        styles.customCSS = customCSS
        delete block.inlineCSS
      }

      if (Object.keys(styles).length > 0) {
        block.styles = styles
        changed = true
      }
    }

    // Recurse into nested blocks (Container/Grid children)
    if (Array.isArray(block.children)) {
      const childChanged = migrateBlocksUp(block.children as Block[])
      if (childChanged) changed = true
    }
  }

  return changed
}

/**
 * Recursively reverse the migration: spread styles back to block root.
 * Returns true if any changes were made.
 */
function migrateBlocksDown(blocks: Block[]): boolean {
  let changed = false

  for (const block of blocks) {
    if (block.styles && typeof block.styles === 'object') {
      const styles = block.styles as Record<string, unknown>

      // Spread style fields back to root
      for (const field of STYLE_FIELDS) {
        if (styles[field] !== undefined) {
          block[field] = styles[field]
        }
      }

      // Best-effort reversal of customCSS merge: copy classes/inlineCSS back to root
      const customCSS = styles.customCSS as Record<string, unknown> | undefined
      if (customCSS) {
        if (typeof customCSS.classes === 'string') {
          block.customClasses = customCSS.classes
        }
        if (typeof customCSS.inlineCSS === 'string') {
          block.inlineCSS = customCSS.inlineCSS
        }
      }

      delete block.styles
      changed = true
    }

    // Recurse into nested blocks
    if (Array.isArray(block.children)) {
      const childChanged = migrateBlocksDown(block.children as Block[])
      if (childChanged) changed = true
    }
  }

  return changed
}

export async function up({ payload }: MigrateUpArgs): Promise<void> {
  const { docs: pages } = await payload.find({
    collection: 'pages',
    limit: 0,
    depth: 0,
  })

  for (const page of pages) {
    const layout = page.layout as Block[] | undefined
    if (!Array.isArray(layout) || layout.length === 0) continue

    const changed = migrateBlocksUp(layout)
    if (changed) {
      await payload.update({
        collection: 'pages',
        id: page.id,
        data: { layout } as never,
      })
      payload.logger.info(`Migrated page styles: ${page.title ?? page.id}`)
    }
  }

  payload.logger.info('Style fields migration (up) complete.')
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
  const { docs: pages } = await payload.find({
    collection: 'pages',
    limit: 0,
    depth: 0,
  })

  for (const page of pages) {
    const layout = page.layout as Block[] | undefined
    if (!Array.isArray(layout) || layout.length === 0) continue

    const changed = migrateBlocksDown(layout)
    if (changed) {
      await payload.update({
        collection: 'pages',
        id: page.id,
        data: { layout } as never,
      })
      payload.logger.info(
        `Reverted page styles: ${page.title ?? page.id}`,
      )
    }
  }

  payload.logger.info('Style fields migration (down) complete.')
}
