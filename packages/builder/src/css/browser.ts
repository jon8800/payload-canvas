// Browser-side Tailwind compile for the canvas iframe. Owner: css agent.
// Must not import Node built-ins (directly or through shared.ts).
import type { CanvasCssInput, TailwindPlugins } from './index'
import { compileFromInput, countUtilityLayers, normalizeClasses, scopeFullBuild } from './shared'

export type CanvasCompiler = {
  /**
   * Full CSS for the page (Preflight + theme + utilities) for exactly these classes. The
   * utilities match only elements with the `builder-css` class, as on the site.
   */
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
  const staticLayers = countUtilityLayers(compiler.build([]))
  // Every class the compiler has seen: its output holds them all.
  const seen = new Set<string>()
  return {
    build: (classes) => {
      const candidates = normalizeClasses(classes)
      for (const cls of candidates) seen.add(cls)
      return scopeFullBuild(compiler.build(candidates), staticLayers, seen)
    },
  }
}
