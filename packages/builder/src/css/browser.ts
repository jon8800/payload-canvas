// Browser-side Tailwind compile for the canvas iframe. Owner: css agent.
// Must not import Node built-ins (directly or through shared.ts).
import type { CanvasCssInput, TailwindPlugins } from './index'
import { compileFromInput, normalizeClasses } from './shared'

export type CanvasCompiler = {
  /** Full CSS for the page (Preflight + theme + utilities) for exactly these classes. */
  build(classes: string[]): string
}

/**
 * Runs Tailwind's `compile()` in the browser from the stylesheets the server recorded
 * (getCanvasCssInput). `plugins` must hold every `@plugin` id the entry uses, or this rejects.
 *
 * build() is append-only: Tailwind's compiler remembers every class it has seen, so the output
 * also holds classes from earlier calls. That is fine in the canvas during one editing session
 * (removed classes only leave unused CSS). Create a new compiler to start from an empty set.
 */
export async function createCanvasCompiler(
  input: CanvasCssInput,
  plugins?: TailwindPlugins,
): Promise<CanvasCompiler> {
  const compiler = await compileFromInput(input, plugins)
  return { build: (classes) => compiler.build(normalizeClasses(classes)) }
}
