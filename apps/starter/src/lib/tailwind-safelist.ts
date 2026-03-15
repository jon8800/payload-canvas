// This file exists solely for Tailwind v4's JIT scanner.
// The @source directive in globals.css points here so that dynamically
// composed class strings from blockStyles.ts survive production CSS purging.

const spacingValues = ['0', '1', '2', '4', '6', '8', '12'] as const
const directions = ['pt', 'pr', 'pb', 'pl', 'mt', 'mr', 'mb', 'ml'] as const
const breakpoints = ['sm', 'md', 'lg', 'xl'] as const

// Spacing classes: pt-0, pt-1, ..., sm:pt-0, sm:pt-1, ..., etc.
const spacingClasses: string[] = []
for (const dir of directions) {
  for (const val of spacingValues) {
    spacingClasses.push(`${dir}-${val}`)
    for (const bp of breakpoints) {
      spacingClasses.push(`${bp}:${dir}-${val}`)
    }
  }
}

// Border radius classes
const borderRadiusValues = ['none', 'sm', 'md', 'lg', 'xl', 'full'] as const
const borderRadiusClasses: string[] = []
for (const val of borderRadiusValues) {
  borderRadiusClasses.push(`rounded-${val}`)
  for (const bp of breakpoints) {
    borderRadiusClasses.push(`${bp}:rounded-${val}`)
  }
}

// Border width classes
const borderWidthValues = ['2', '4', '8'] as const
const borderWidthClasses: string[] = [
  'border',
  ...breakpoints.map((bp) => `${bp}:border`),
]
for (const val of borderWidthValues) {
  borderWidthClasses.push(`border-${val}`)
  for (const bp of breakpoints) {
    borderWidthClasses.push(`${bp}:border-${val}`)
  }
}

// Text size classes
const textSizeValues = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'] as const
const textSizeClasses: string[] = []
for (const val of textSizeValues) {
  textSizeClasses.push(`text-${val}`)
  for (const bp of breakpoints) {
    textSizeClasses.push(`${bp}:text-${val}`)
  }
}

// Background color classes (shadcn/ui theme palette)
const colorValues = [
  'primary', 'secondary', 'muted', 'accent', 'destructive',
  'background', 'foreground', 'card', 'popover',
] as const

const bgColorClasses: string[] = []
for (const val of colorValues) {
  bgColorClasses.push(`bg-${val}`)
  for (const bp of breakpoints) {
    bgColorClasses.push(`${bp}:bg-${val}`)
  }
}

// Text color classes (shadcn/ui theme palette)
const textColorClasses: string[] = []
for (const val of colorValues) {
  textColorClasses.push(`text-${val}`)
  for (const bp of breakpoints) {
    textColorClasses.push(`${bp}:text-${val}`)
  }
}

const allClasses = [
  ...spacingClasses,
  ...borderRadiusClasses,
  ...borderWidthClasses,
  ...textSizeClasses,
  ...bgColorClasses,
  ...textColorClasses,
]

export default allClasses
