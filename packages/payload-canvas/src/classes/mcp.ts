// MCP tools for editable classes, in the `payload-mcp-toolkit` `customTools` format. Registered by
// `builderMcpTools` (src/mcp). Each tool takes `collection` (the classes collection), so the
// toolkit checks the API key's scope for it. Handlers run as the key's user.

import { z } from 'zod'

import type { BuilderMcpTool, McpToolResult } from '../mcp'
import { deleteClass, findClass, loadClasses, namesOf, upsertClass } from './actions'
import { DEFAULT_CLASSES_SLUG, type BuilderClass } from './shared'
import { classUsage, publishedClassUsage } from './usage'

const text = (value: unknown): McpToolResult => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] })
const fail = (message: string, details?: unknown): McpToolResult => ({
  content: [{ type: 'text', text: details === undefined ? `Error: ${message}` : `Error: ${message}\n${JSON.stringify(details)}` }],
  isError: true,
})

/** How classes work, for the AI. Tool descriptions are prompts: keep them exact. */
export const CLASSES_GUIDE = [
  'Classes are named, shared styles of this site (for example "card", "btn-primary", "type-h2"). A block uses one by putting its name in its className, next to Tailwind classes: "card md:col-span-2".',
  'A class holds `styles` (Tailwind classes with variants, exactly as in a className: "rounded-xl p-6 md:p-8 hover:shadow-lg"; another class name applies that class) and optional `css` (custom CSS inside the class rule for what Tailwind cannot express: layered gradients, "&::before { … }", @keyframes).',
  'Changing a class restyles every block that uses it, on every page. A block\'s own Tailwind classes beat its class\'s styles. Prefer a class when the same look repeats (cards, buttons, section spacing); keep one-off tweaks as utilities on the block.',
  'Saves are drafts: the builder\'s canvas shows them at once. The live site gets a class when it is published (publish: true), or when someone publishes a page that uses it.',
].join('\n')

/** The published pages that use one of `names`, for a tool result. Empty when there are none or the scan fails. */
async function livePages(req: Parameters<BuilderMcpTool['handler']>[1], names: string[]) {
  const docs = await publishedClassUsage(req, names).catch(() => [])
  return docs.map(({ collection, id, title }) => ({ collection, id, title }))
}

const summary = (item: BuilderClass) => ({
  name: item.name,
  ...(item.label ? { label: item.label } : {}),
  ...(item.group ? { group: item.group } : {}),
  ...(item.styles ? { styles: item.styles } : {}),
  ...(item.css ? { css: item.css } : {}),
  ...(item.previousNames?.length ? { previousNames: item.previousNames } : {}),
  status: item.status,
})

export function classMcpTools(options: { slug?: string } = {}): BuilderMcpTool[] {
  const slug = options.slug ?? DEFAULT_CLASSES_SLUG
  // One possible value, so it may be left out: the default fills it in before the toolkit's scope check.
  const collectionArg = z.enum([slug]).default(slug).describe(`Always "${slug}" (the classes collection; may be left out).`)
  const nameArg = z.string().min(1).max(64).describe('The class name without the dot, e.g. "card".')

  const listClasses: BuilderMcpTool = {
    name: 'listClasses',
    routing: { kind: 'collection', action: 'read' },
    description: 'Lists the site\'s classes (named, shared styles such as "card" or "btn-primary") with their styles, status and how many blocks use each. The result\'s `guide` explains how classes work.',
    parameters: { collection: collectionArg },
    handler: async (_args, req) => {
      try {
        const classes = await loadClasses(req)
        const usage = await classUsage(req, namesOf(classes))
        return text({
          guide: CLASSES_GUIDE,
          classes: classes.map((item) => ({ ...summary(item), usedBy: { blocks: usage[item.name]?.blocks ?? 0, pages: usage[item.name]?.documents.length ?? 0 } })),
          next: 'getClass for where a class is used. upsertClass to create or change one. Use a class on a block with applyOperations: update { id, addClassName: "card" }.',
        })
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error))
      }
    },
  }

  const getClass: BuilderMcpTool = {
    name: 'getClass',
    routing: { kind: 'collection', action: 'read' },
    description: 'Returns one class (its latest draft) and the pages and blocks that use it.',
    parameters: { collection: collectionArg, name: nameArg },
    handler: async (args, req) => {
      try {
        const item = await findClass(req, String(args.name))
        if (!item) return fail(`No class named "${String(args.name)}". listClasses shows them.`)
        const usage = (await classUsage(req, [item.name, ...(item.previousNames ?? [])]))
        return text({ class: summary(item), usage: usage[item.name], ...(item.previousNames?.length ? { usageOfPreviousNames: Object.fromEntries(item.previousNames.map((n) => [n, usage[n]])) } : {}) })
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error))
      }
    },
  }

  const upsertClassTool: BuilderMcpTool = {
    name: 'upsertClass',
    routing: { kind: 'collection', action: 'update' },
    description: [
      'Creates the class `name`, or changes it when it exists. Fields you leave out stay as they are; null clears one. Saves a draft; publish: true also publishes it. Without publish, the result lists the published pages that still show the old version (`publishedPagesWithOldVersion`).',
      '`newName` renames the class and every block on every page that uses it (their drafts). Published pages keep working with the old name until they are published again.',
      'The name must not be a Tailwind class ("flex", "shadow"). Unknown Tailwind classes in `styles` are left out of the stylesheet; invalid custom CSS blocks publishing.',
      CLASSES_GUIDE,
    ].join('\n\n'),
    parameters: {
      collection: collectionArg,
      name: nameArg,
      newName: z.string().min(1).max(64).optional().describe('Renames the class everywhere.'),
      label: z.string().max(120).nullable().optional().describe('A readable name, e.g. "Primary button".'),
      group: z.string().max(60).nullable().optional().describe('Groups classes in the editor, e.g. "Buttons".'),
      styles: z.string().nullable().optional().describe('Tailwind classes with variants, e.g. "rounded-xl p-6 md:p-8 hover:shadow-lg". Replaces all of them.'),
      css: z.string().nullable().optional().describe('Custom CSS inside the class rule: declarations, nested rules ("&:hover { … }", "&::before { … }"), @keyframes. Replaces it.'),
      publish: z.boolean().optional().describe('true: publish now. The live site changes on every page that uses the class.'),
    },
    handler: async (args, req) => {
      const result = await upsertClass(req, {
        name: String(args.name),
        ...(typeof args.newName === 'string' ? { newName: args.newName } : {}),
        ...(args.label !== undefined ? { label: args.label as string | null } : {}),
        ...(args.group !== undefined ? { group: args.group as string | null } : {}),
        ...(args.styles !== undefined ? { styles: args.styles as string | null } : {}),
        ...(args.css !== undefined ? { css: args.css as string | null } : {}),
        publish: args.publish === true,
      })
      if (!result.ok) return fail(result.error)
      // Without publish the live site keeps the published class (and, after a rename, the old name)
      // on every published page that uses it.
      const oldName = String(args.name)
      const live = args.publish === true ? [] : await livePages(req, [...new Set([oldName, result.class.name, ...(result.class.previousNames ?? [])])])
      const renamed = result.class.name !== oldName
      return text({
        ok: true,
        created: result.created,
        class: summary(result.class),
        ...(result.renamed ? { renamedIn: { pages: result.renamed.documents, blocks: result.renamed.blocks, ...(result.renamed.failed.length ? { failed: result.renamed.failed } : {}) } } : {}),
        ...(live.length > 0
          ? {
              publishedPagesWithOldVersion: live,
              note: renamed
                ? `These published pages still show the old published version of .${oldName}. Publish the class (upsertClass with publish: true) to make the change live, then publish these pages again (publishDraft) so they use the new name.`
                : `These published pages still show the old published version of .${result.class.name}. Publish the class (upsertClass with publish: true), or publish one of these pages (that publishes the classes it uses), to make the change live.`,
            }
          : {}),
      })
    },
  }

  const deleteClassTool: BuilderMcpTool = {
    name: 'deleteClass',
    routing: { kind: 'collection', action: 'delete' },
    description:
      'Deletes a class. While blocks use it, it is refused with the list of pages, unless removeFromBlocks is true: then the class is removed from those blocks (their drafts) first. Published pages lose its styles at once: the result lists them (`publishedPagesWithOldVersion`) so you can publish them again.',
    parameters: {
      collection: collectionArg,
      name: nameArg,
      removeFromBlocks: z.boolean().optional().describe('true: remove the class from every block that uses it, then delete it.'),
    },
    handler: async (args, req) => {
      const item = await findClass(req, String(args.name)).catch(() => null)
      if (!item) return fail(`No class named "${String(args.name)}".`)
      // Read before the delete. The published layouts keep the name after it.
      const live = await livePages(req, [item.name, ...(item.previousNames ?? [])])
      const result = await deleteClass(req, item.id, { removeFromBlocks: args.removeFromBlocks === true })
      if (!result.ok) return fail(result.error, result.usage ? { usedOn: result.usage.documents } : undefined)
      return text({
        ok: true,
        deleted: result.name,
        removedFrom: { pages: result.replaced.documents, blocks: result.replaced.blocks },
        ...(live.length > 0
          ? {
              publishedPagesWithOldVersion: live,
              note: `These published pages still use .${result.name} in their published layout and lost its styles now. Their drafts no longer use it: check them, then publish them again (publishDraft).`,
            }
          : {}),
      })
    },
  }

  return [listClasses, getClass, upsertClassTool, deleteClassTool]
}
