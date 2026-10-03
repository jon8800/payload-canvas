import type { Config, Plugin } from 'payload'
import type { BlockDefinition } from '../core/types'
import type { TailwindPlugins } from '../css'

export type BuilderCollectionOptions = {
  /** Name of the layout JSON field. Default "layout". */
  field?: string
  /** Frontend path of a document. Used for preview. */
  url?: (doc: Record<string, unknown>) => string
}

export type WebsiteBuilderOptions = {
  collections: Record<string, BuilderCollectionOptions>
  /** Default: defaultBlocks(). */
  blocks?: BlockDefinition[]
  css: {
    /** Path to the app's Tailwind entry CSS, absolute or relative to process.cwd(). */
    entry: string
    plugins?: TailwindPlugins
  }
  /** Frontend route that renders the canvas iframe. Default "/builder-canvas". */
  canvasPath?: string
}

export function websiteBuilder(options: WebsiteBuilderOptions): Plugin {
  return (config: Config) => {
    void options
    return config
  }
}
