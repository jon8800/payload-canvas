// The theme global: colors, fonts, radius and spacing, with the plugin's color, font and slider
// fields. Server-only (the revalidation hook imports next/cache).
import { revalidatePath, revalidateTag } from 'next/cache'
import type { ArrayField, Field, GlobalAfterChangeHook, GlobalBeforeChangeHook, GlobalConfig, TextField } from 'payload'

import { deriveColors } from './colors'
import { DEFAULT_THEME_SLUG, type ThemeOptions } from './config'
import { forgetThemeVariables } from './server'
import { VARIABLE_TYPES, variableNameProblem, variableValueProblem, type ThemeVariableType } from './variables'

const CLIENT = 'payload-canvas/theme-client'
const COLOR_FIELD = `${CLIENT}#ThemeColorField`
const FONT_FIELD = `${CLIENT}#ThemeFontField`
const SLIDER_FIELD = `${CLIENT}#ThemeSliderField`
const SAVE_SIGNAL = `${CLIENT}#ThemeSaveSignal`
const VARIABLE_VALUE_FIELD = `${CLIENT}#ThemeVariableValueField`
const VARIABLE_ROW_LABEL = `${CLIENT}#ThemeVariableRowLabel`
const VARIABLES_WARNING = `${CLIENT}#ThemeVariablesWarning`

/** Name of the hidden field that holds the derived color variables. */
export const DERIVED_TOKENS_FIELD = 'derivedTokens'

const COLORS: { name: string; description: string }[] = [
  { name: 'primary', description: 'Buttons, links and accents.' },
  { name: 'secondary', description: 'Secondary buttons and surfaces.' },
  { name: 'accent', description: 'Highlights and hover surfaces.' },
  { name: 'muted', description: 'Quiet surfaces. Secondary text is derived from the background and text colors.' },
  { name: 'destructive', description: 'Errors and destructive actions.' },
  { name: 'background', description: 'Page background. Cards and popovers use it too.' },
  { name: 'foreground', description: 'Body text. Borders are mixed from the background and this color.' },
]

const colorField = ({ name, description }: (typeof COLORS)[number]): TextField => ({
  name,
  type: 'text',
  admin: { description: `${description} Empty: the default from your CSS.`, components: { Field: COLOR_FIELD } },
})

const fontField = (name: string, label: string, description: string): TextField => ({
  name,
  type: 'text',
  label,
  admin: { description, components: { Field: FONT_FIELD } },
})

/** The global's fields. Names and types match the starter's earlier `theme-settings` global, so its data keeps working. */
function themeFields(): Field[] {
  return [
    { name: 'colors', type: 'group', label: 'Colors', fields: COLORS.map(colorField) },
    {
      name: 'fonts',
      type: 'group',
      label: 'Fonts',
      admin: { description: 'Google Fonts. The site loads the chosen families.' },
      fields: [
        fontField('sans', 'Body text', 'Sets --font-sans. Empty: the default from your CSS.'),
        fontField('heading', 'Headings', 'Sets --font-heading. Empty: your CSS decides, usually the body font.'),
        fontField('mono', 'Code', 'Sets --font-mono. Empty: the default from your CSS.'),
      ],
    },
    {
      name: 'spacing',
      type: 'group',
      label: 'Spacing',
      fields: [
        {
          name: 'baseMultiplier',
          type: 'number',
          label: 'Spacing unit',
          min: 1,
          max: 16,
          admin: {
            description: 'Tailwind spacing unit in px (--spacing). p-4 is 4 units. Tailwind default: 4. Empty: the default from your CSS.',
            components: { Field: SLIDER_FIELD },
            custom: { min: 1, max: 16, step: 1, unit: 'px', fallback: 4 },
          },
        },
      ],
    },
    {
      name: 'borderRadius',
      type: 'text',
      label: 'Corner radius',
      admin: {
        description: 'Base corner radius in rem (--radius). Empty: the default from your CSS.',
        components: { Field: SLIDER_FIELD },
        custom: { min: 0, max: 2, step: 0.125, unit: 'rem', fallback: 0.625 },
      },
    },
    variablesField(),
    // Warns while a rename or a removal would break blocks or classes that use a variable.
    { name: 'variablesWarning', type: 'ui', admin: { components: { Field: VARIABLES_WARNING } } },
    { name: DERIVED_TOKENS_FIELD, type: 'json', admin: { hidden: true } },
    // Renders nothing. After each save it tells open builder canvases to reload the theme.
    { name: 'themeSaveSignal', type: 'ui', admin: { components: { Field: SAVE_SIGNAL } } },
  ]
}

const typeOf = (siblingData: unknown): ThemeVariableType => {
  const type = (siblingData as { type?: unknown } | undefined)?.type
  return type === 'size' || type === 'font' ? type : 'color'
}

/**
 * Design variables: named colors, sizes and fonts (`bg-brand`, `p-gutter`, `font-display`), with
 * an optional dark-mode value. See `variables.ts`.
 */
function variablesField(): ArrayField {
  return {
    name: 'variables',
    type: 'array',
    label: 'Variables',
    labels: { singular: 'Variable', plural: 'Variables' },
    admin: {
      description: 'Named colors, sizes and fonts. Blocks and classes use them by name, so one change here updates every page.',
      initCollapsed: true,
      components: { RowLabel: VARIABLE_ROW_LABEL },
    },
    fields: [
      {
        type: 'row',
        fields: [
          {
            name: 'name',
            type: 'text',
            required: true,
            admin: { width: '50%', placeholder: 'brand' },
            validate: (value: unknown, { siblingData, data }: { siblingData?: unknown; data?: unknown }) => {
              const problem = variableNameProblem(value, typeOf(siblingData))
              if (problem) return problem
              const rows = ((data as { variables?: Array<{ name?: unknown }> } | undefined)?.variables ?? []).filter((row) => typeof row?.name === 'string' && row.name.trim() === String(value).trim())
              return rows.length > 1 ? 'Another variable has this name.' : true
            },
          },
          {
            name: 'type',
            type: 'select',
            required: true,
            defaultValue: 'color',
            options: VARIABLE_TYPES.map((t) => ({ value: t.value, label: t.label })),
            admin: { width: '50%' },
          },
        ],
      },
      {
        type: 'row',
        fields: [
          {
            name: 'value',
            type: 'text',
            required: true,
            admin: { width: '50%', components: { Field: VARIABLE_VALUE_FIELD } },
            validate: (value: unknown, { siblingData }: { siblingData?: unknown }) => variableValueProblem(value, typeOf(siblingData)) ?? (value ? true : 'Enter a value.'),
          },
          {
            name: 'darkValue',
            type: 'text',
            label: 'Dark mode',
            admin: {
              width: '50%',
              description: 'Used inside the dark class. Empty: the same value.',
              condition: (_data, siblingData) => typeOf(siblingData) !== 'font',
              components: { Field: VARIABLE_VALUE_FIELD },
            },
            validate: (value: unknown, { siblingData }: { siblingData?: unknown }) => variableValueProblem(value, typeOf(siblingData)) ?? true,
          },
        ],
      },
    ],
  }
}

/** Derives the color variables on the same write, so API consumers get them too. */
const deriveTokens: GlobalBeforeChangeHook = ({ data, originalDoc }) => ({
  ...data,
  [DERIVED_TOKENS_FIELD]: deriveColors({ ...originalDoc?.colors, ...data.colors }),
})

/**
 * Clears Next's caches after a save: the theme's cache tag, and every page's cached render
 * (the theme is in every page's `<head>`). `context.disableRevalidate` skips it. Outside a Next
 * request (seed scripts, `payload run`) Next throws; that is logged and ignored.
 */
function revalidateTheme(cacheTag: string): GlobalAfterChangeHook {
  return ({ doc, req: { payload, context } }) => {
    // The compiles read the variables again (a new name makes `bg-<name>` exist).
    forgetThemeVariables(payload)
    if (context?.disableRevalidate) return doc
    try {
      revalidateTag(cacheTag, { expire: 0 })
      revalidatePath('/', 'layout')
    } catch (error) {
      payload.logger.debug(`[websiteBuilder] Theme revalidation skipped: ${error instanceof Error ? error.message : String(error)}`)
    }
    return doc
  }
}

export function themeGlobal(options: ThemeOptions): GlobalConfig {
  const slug = options.slug ?? DEFAULT_THEME_SLUG
  return {
    slug,
    label: options.label ?? 'Theme',
    access: {
      read: () => true,
      update: ({ req }) => Boolean(req.user),
      ...options.access,
    },
    admin: { ...options.admin },
    hooks: {
      ...options.hooks,
      beforeChange: [deriveTokens, ...(options.hooks?.beforeChange ?? [])],
      afterChange: [revalidateTheme(options.cacheTag ?? slug), ...(options.hooks?.afterChange ?? [])],
    },
    fields: themeFields(),
  }
}
