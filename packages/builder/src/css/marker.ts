// The marker class for elements the generated CSS styles. No imports: the client-safe `/blocks`
// entry re-exports it, so components and RenderLayout can use it.

/**
 * Every rule of the generated CSS matches only elements with this class. `RenderLayout` adds it to
 * the `className` it gives each block component. A component adds it to its own elements that use
 * the classes listed in its block definition's `classes`.
 *
 * Why: the page also loads the app's own CSS, which has the classes of the app's components in
 * Tailwind's order. Without the marker, a class that is in both sheets (say `flex`) comes again
 * in the later generated sheet and beats the app's `md:grid` on a component that uses
 * `flex md:grid`. With the marker, the generated rules never touch the app's elements, and on
 * the block's element, which has all its classes in the generated sheet, they keep Tailwind's order.
 * `:where()` adds no specificity, so the rules keep the specificity of plain Tailwind classes.
 */
export const BUILDER_CSS_CLASS = 'builder-css'

/** Adds the marker class to a block's classes. Empty classes stay empty: nothing to style. */
export function withBuilderCssClass(className: string | null | undefined): string | undefined {
  const value = className?.trim()
  return value ? `${value} ${BUILDER_CSS_CLASS}` : undefined
}
