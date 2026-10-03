// Server-only Tailwind compile. Owner: css agent. See docs/architecture.md section 8.

/** Tailwind plugins by the id used in `@plugin "<id>"`, e.g. { '@tailwindcss/typography': typography }. */
export type TailwindPlugins = Record<string, unknown>

export type CssOptions = {
  /** Absolute path to the app's Tailwind entry CSS (the file with @import "tailwindcss" and @theme). */
  entry: string
  plugins?: TailwindPlugins
}

/**
 * What the canvas iframe needs to run the same compile in the browser.
 * JSON-serializable. Its inner shape is private to the css module.
 */
export type CanvasCssInput = { version: 1; entry: string; [key: string]: unknown }

/**
 * Compiles only the given classes against the app's CSS entry. Output: the utilities plus the
 * @property / @keyframes rules they need. No Preflight, no base layer, never overrides theme vars.
 */
export async function compileClasses(classes: string[], options: CssOptions): Promise<string> {
  throw new Error('not implemented')
}

/** Input for createCanvasCompiler (browser). Cached per entry file content. */
export async function getCanvasCssInput(options: CssOptions): Promise<CanvasCssInput> {
  throw new Error('not implemented')
}

/** Globs for next.config `outputFileTracingIncludes`, so the compile works in standalone output. */
export function tracingIncludes(entryRelativeToApp: string): string[] {
  throw new Error('not implemented')
}
