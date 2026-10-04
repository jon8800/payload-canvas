// Converts the content of a Payload `blocks` field into the builder's layout field, for every
// document and every version (drafts included). Server only.
//
// Why the database adapter's `updateOne` / `updateVersion` and not `payload.update`: an update
// through the Local API creates a new version and, on a document with a newer draft, would make
// the published data the latest version again (the draft would be lost from the admin). The
// adapter methods write only the two JSON columns in place, on every adapter Payload ships with
// a SQL engine (Postgres, SQLite). They skip hooks, so this module compiles the CSS itself.

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { Payload, Where } from 'payload'

import { collectClasses } from '../core/classes'
import { convertPayloadBlocksLayout, type PayloadConversionReport } from '../core/convertPayload'
import { describeLayoutErrors } from '../core/issues'
import { normalizeLayout } from '../core/tree'
import type { BlockDefinition, Layout } from '../core/types'
import { compileClasses, type CssOptions } from '../css'
import { cssFieldName, siteCssConfigOf } from '../plugin'
import { checkLayout, type GeneratedCss } from '../plugin/hook'
import { backfillReferences, type BackfillResult } from '../plugin/references'

export type MigrateBlocksOptions = {
  /** Collection slug, e.g. "pages". */
  collection: string
  /** The Payload `blocks` field that holds the old content, e.g. "layout". A top-level field. */
  from: string
  /** The builder's layout field (`websiteBuilder({ collections: { pages: { field } } })`), e.g. "builderLayout". */
  to: string
  /** Only report, write nothing. Default `true`: pass `dryRun: false` to write. */
  dryRun?: boolean
  /** Convert documents whose builder field has content already. Default false (they are skipped). */
  overwrite?: boolean
  /** Convert every version (drafts and history) too. Default true. */
  versions?: boolean
  /** Only these documents. */
  where?: Where
  /** Block definitions. Default: the blocks of the `websiteBuilder` plugin. */
  blocks?: BlockDefinition[]
  /** Progress lines. Default: none. */
  log?: (line: string) => void
}

/** Counts for documents or versions. */
export type MigrateCounts = {
  /** Read from the database. */
  found: number
  /** Converted (or, in a dry run, would be converted). */
  converted: number
  /** The builder field has content already (and `overwrite` is off), or it holds the same layout. */
  skipped: number
  /** The old field is empty, or every block in it is unknown: nothing to write. */
  empty: number
  /** The write failed. See `errors`. */
  failed: number
}

export type MigrateIssue = { id: string | number; version?: string | number; message: string }

export type MigrateBlocksReport = {
  collection: string
  from: string
  to: string
  dryRun: boolean
  documents: MigrateCounts
  versions: MigrateCounts
  /** Why versions were not converted, when they were not. */
  versionsSkipped?: string
  /** Blocks written, at every depth. */
  blocks: number
  /** Payload `blockType`s without a block definition (left out), with how many blocks. */
  unknownTypes: Record<string, number>
  /** Fields with a value that the block definitions do not have (left out), by `blockType`. */
  droppedFields: Record<string, string[]>
  /**
   * Layouts that were written but need a fix in the builder. `invalid` problems block every save
   * of the layout (for example a select value that is no longer an option); the others block
   * only publishing (for example a required field that is empty).
   */
  problems: Array<MigrateIssue & { blocking: 'save' | 'publish' }>
  errors: MigrateIssue[]
  /**
   * The "used in" records (`backfillReferences`) of the collection, refreshed after a real run,
   * because the adapter writes skip the hook that keeps them. Empty in a dry run.
   */
  references: BackfillResult[]
}

const counts = (): MigrateCounts => ({ found: 0, converted: 0, skipped: 0, empty: 0, failed: 0 })
const PAGE_SIZE = 100

type Converted =
  | { status: 'convert'; layout: Layout; css: GeneratedCss; blocks: number; report: PayloadConversionReport }
  | { status: 'skip' | 'empty'; report?: PayloadConversionReport }

/**
 * Converts a collection's Payload `blocks` field into the builder's layout field, for every
 * document, and for every version and draft. Idempotent: documents whose builder field has content
 * are skipped (unless `overwrite`), and converting twice gives the same layout. The old field is
 * never changed or deleted.
 *
 * Run it from a script with `payload run`, while nobody edits the collection (an open builder
 * keeps its own copy of the layout and would save over the result):
 *
 * ```ts
 * // scripts/migrate-blocks.ts — run with: pnpm payload run scripts/migrate-blocks.ts
 * import config from '@payload-config'
 * import { formatMigrationReport, migrateBlocksField } from '@payload-toolkit/builder'
 * import { getPayload } from 'payload'
 *
 * const payload = await getPayload({ config })
 * const report = await migrateBlocksField(payload, { collection: 'pages', from: 'layout', to: 'builderLayout', dryRun: true })
 * console.log(formatMigrationReport(report))
 * process.exit(0)
 * ```
 *
 * Writes go through the database adapter (`updateOne`, `updateVersion`) with only the builder
 * field and its CSS field, so no new versions are made and no hooks run. On MongoDB the versions
 * are left out (not tested there): convert them by saving each document in the builder.
 */
export async function migrateBlocksField(payload: Payload, options: MigrateBlocksOptions): Promise<MigrateBlocksReport> {
  const { collection, from, to } = options
  const dryRun = options.dryRun ?? true
  const log = options.log ?? (() => {})
  const config = (payload.collections as unknown as Record<string, { config: { flattenedFields: unknown[]; versions?: unknown } } | undefined>)[collection]?.config
  if (!config) throw new Error(`[migrateBlocksField] Collection "${collection}" does not exist.`)
  const fields = config.flattenedFields as Array<{ name: string; type: string }>
  const target = fields.find((f) => f.name === to)
  if (!target || target.type !== 'json') {
    throw new Error(
      `[migrateBlocksField] "${collection}" has no builder field "${to}". Add it with websiteBuilder({ collections: { ${collection}: { field: '${to}' } } }) first.`,
    )
  }
  if (!fields.some((f) => f.name === from)) {
    throw new Error(`[migrateBlocksField] "${collection}" has no top-level field "${from}".`)
  }
  const site = siteCssConfigOf(payload)
  const blocks = options.blocks ?? site?.blocks
  if (!blocks) throw new Error('[migrateBlocksField] No block definitions. Pass `blocks`, or add the websiteBuilder plugin.')
  const cssField = cssFieldName(to)
  const compile = cssCompiler(site?.css ?? null)

  const report: MigrateBlocksReport = {
    collection,
    from,
    to,
    dryRun,
    documents: counts(),
    versions: counts(),
    blocks: 0,
    unknownTypes: {},
    droppedFields: {},
    problems: [],
    errors: [],
    references: [],
  }
  const merge = (part: PayloadConversionReport) => {
    for (const [type, n] of Object.entries(part.unknownTypes)) report.unknownTypes[type] = (report.unknownTypes[type] ?? 0) + n
    for (const [type, names] of Object.entries(part.droppedFields)) {
      const list = (report.droppedFields[type] ??= [])
      for (const name of names) if (!list.includes(name)) list.push(name)
    }
  }

  const convert = async (data: Record<string, unknown>, issue: Omit<MigrateIssue, 'message'>): Promise<Converted> => {
    const existing = data[to]
    const hasExisting = normalizeLayout(existing).blocks.length > 0
    if (hasExisting && !options.overwrite) return { status: 'skip' }
    const { layout, report: part } = convertPayloadBlocksLayout(data[from], blocks)
    if (layout.blocks.length === 0) return { status: 'empty', report: part }
    if (hasExisting && JSON.stringify(normalizeLayout(existing)) === JSON.stringify(layout)) return { status: 'skip', report: part }
    for (const [publishing, blocking] of [[false, 'save'], [true, 'publish']] as const) {
      const { blocking: errors } = checkLayout(layout, { blocks, publishing })
      const fresh = publishing ? errors.filter((e) => e.code !== 'invalid') : errors
      for (const line of describeLayoutErrors(layout, fresh, blocks)) report.problems.push({ ...issue, message: line.message, blocking })
    }
    return { status: 'convert', layout, css: await compile(layout, blocks), blocks: countOf(part), report: part }
  }

  const docs = paged((page) =>
    payload.find({ collection: collection as never, depth: 0, draft: false, limit: PAGE_SIZE, page, where: options.where, showHiddenFields: true, overrideAccess: true }),
  )
  const versionsOff = options.versions === false ? 'turned off' : payload.db.name === 'mongoose' ? 'not supported on MongoDB yet' : null
  if (versionsOff) report.versionsSkipped = versionsOff
  const withVersions = !versionsOff && Boolean(config.versions)

  for await (const doc of docs) {
    const id = (doc as { id: string | number }).id
    report.documents.found++
    const result = await convert(doc as Record<string, unknown>, { id })
    if (result.report) merge(result.report)
    if (result.status !== 'convert') report.documents[result.status === 'skip' ? 'skipped' : 'empty']++
    else {
      try {
        if (!dryRun) {
          await payload.db.updateOne({ collection: collection as never, id, data: { [to]: result.layout, [cssField]: result.css }, returning: false })
        }
        report.documents.converted++
        report.blocks += result.blocks
        log(`${dryRun ? 'Would convert' : 'Converted'} ${collection} ${id} (${result.blocks} blocks)`)
      } catch (error) {
        report.documents.failed++
        report.errors.push({ id, message: messageOf(error) })
      }
    }

    if (!withVersions) continue
    const versions = paged((page) =>
      payload.findVersions({
        collection: collection as never,
        depth: 0,
        limit: PAGE_SIZE,
        page,
        where: { parent: { equals: id } },
        showHiddenFields: true,
        overrideAccess: true,
      }),
    )
    for await (const version of versions) {
      const versionId = version.id as string | number
      report.versions.found++
      const data = (version.version ?? {}) as Record<string, unknown>
      const converted = await convert(data, { id, version: versionId })
      if (converted.report) merge(converted.report)
      if (converted.status !== 'convert') {
        report.versions[converted.status === 'skip' ? 'skipped' : 'empty']++
        continue
      }
      try {
        if (!dryRun) {
          await payload.db.updateVersion({
            collection: collection as never,
            id: versionId,
            versionData: { version: { [to]: converted.layout, [cssField]: converted.css } },
            returning: false,
          })
        }
        report.versions.converted++
        report.blocks += converted.blocks
      } catch (error) {
        report.versions.failed++
        report.errors.push({ id, version: versionId, message: messageOf(error) })
      }
    }
  }
  // The writes skipped the save hook that records which documents use which media and pages.
  const wrote = report.documents.converted + report.versions.converted > 0
  if (!dryRun && wrote) report.references = await backfillReferences(payload, { collections: [collection] })
  return report
}

function countOf(part: PayloadConversionReport): number {
  return part.blocks
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Every document of a paginated Local API query, page by page. */
async function* paged<T>(load: (page: number) => Promise<{ docs: T[]; hasNextPage?: boolean }>): AsyncGenerator<T> {
  for (let page = 1; ; page++) {
    const result = await load(page)
    yield* result.docs
    if (!result.hasNextPage) return
  }
}

/** The same CSS the save hook makes, cached by class list during one run. */
function cssCompiler(css: CssOptions | null): (layout: Layout, blocks: BlockDefinition[]) => Promise<GeneratedCss> {
  const cache = new Map<string, Promise<GeneratedCss>>()
  let entry: Promise<string> | null = null
  return (layout, blocks) => {
    const classes = collectClasses(layout, blocks)
    const key = classes.join(' ')
    const cached = cache.get(key)
    if (cached) return cached
    const job = (async (): Promise<GeneratedCss> => {
      entry ??= css ? readFile(css.entry, 'utf8').catch(() => '') : Promise.resolve('')
      // Same hash as the save hook (class list + entry file), so the first save does not recompile.
      const hash = createHash('sha256').update(classes.join(' ')).update('\0').update(await entry).digest('hex').slice(0, 16)
      if (!css || classes.length === 0) return { hash, css: '' }
      try {
        return { hash, css: await compileClasses(classes, css) }
      } catch {
        // The first save in the builder compiles it again.
        return { hash: '', css: '' }
      }
    })()
    cache.set(key, job)
    return job
  }
}

/** The report as readable text, for a script's output. */
export function formatMigrationReport(report: MigrateBlocksReport): string {
  const lines: string[] = []
  const line = (text: string) => lines.push(text)
  const what = (c: MigrateCounts) =>
    `${c.found} found, ${c.converted} ${report.dryRun ? 'to convert' : 'converted'}, ${c.skipped} skipped (builder field has content), ${c.empty} empty${c.failed ? `, ${c.failed} failed` : ''}`
  line(`${report.collection}.${report.from} -> ${report.collection}.${report.to}${report.dryRun ? ' (dry run: nothing written)' : ''}`)
  line(`Documents: ${what(report.documents)}`)
  line(report.versionsSkipped ? `Versions: not converted (${report.versionsSkipped})` : `Versions: ${what(report.versions)}`)
  line(`Blocks: ${report.blocks}`)
  const unknown = Object.entries(report.unknownTypes)
  if (unknown.length > 0) line(`Block types without a definition (left out): ${unknown.map(([t, n]) => `${t} (${n})`).join(', ')}`)
  const dropped = Object.entries(report.droppedFields)
  if (dropped.length > 0) line(`Fields not in the block definitions (left out): ${dropped.map(([t, names]) => `${t}: ${names.join(', ')}`).join('; ')}`)
  if (report.problems.length > 0) {
    line(`Problems to fix in the builder (${report.problems.length}):`)
    const seen = new Set<string>()
    for (const p of report.problems) {
      const text = `  ${p.version ? `${p.id} version ${p.version}` : p.id}: ${p.message} (blocks ${p.blocking === 'save' ? 'saving' : 'publishing'})`
      if (!seen.has(text)) lines.push(text)
      seen.add(text)
    }
  }
  for (const e of report.errors) line(`Error ${e.version ? `${e.id} version ${e.version}` : e.id}: ${e.message}`)
  for (const r of report.references) {
    line(`"Used in" records: ${r.checked} documents checked, ${r.updated} updated, ${r.draftsChecked} drafts checked, ${r.draftsUpdated} updated`)
  }
  if (report.dryRun) line('Nothing was written. Run again with dryRun: false to write.')
  return lines.join('\n')
}
