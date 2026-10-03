// Browser-side Tailwind compile for the canvas iframe. Owner: css agent.
import type { CanvasCssInput, TailwindPlugins } from './index'

export type CanvasCompiler = {
  /** Full CSS for the page (Preflight + theme + utilities) for exactly these classes. */
  build(classes: string[]): string
}

export async function createCanvasCompiler(
  input: CanvasCssInput,
  plugins?: TailwindPlugins,
): Promise<CanvasCompiler> {
  throw new Error('not implemented')
}
