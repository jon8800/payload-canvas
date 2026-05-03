# Quick Task 1: Redesign theme settings admin components - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Task Boundary

Redesign all custom admin field components (theme settings + styles panel) to be professional, Webflow-inspired, and native to Payload admin UI aesthetic.

</domain>

<decisions>
## Implementation Decisions

### Component Strategy
- Build shadcn-inspired components using Payload's CSS variables (--theme-elevation-*, --theme-text, --base, --border-radius-m)
- Use @payloadcms/ui package components as base where possible (undocumented but importable)
- DO NOT add Tailwind CSS to admin context — use Payload's native SCSS/CSS variable system
- Components must work in both light and dark admin themes automatically

### StylesPanel Bounding Box Redesign
- Webflow-inspired, not the current bulky multi-colored design
- Center the bounding box properly
- Remove different colors for margin vs padding — use subtle, unified styling like Webflow
- Remove horizontal padding from the customizer right sidebar
- Property inputs and accordions must look professional and Webflow-like

### Custom CSS Input
- Replace tiny text input with a code editor component
- Use Payload's built-in code field component (@payloadcms/ui) if available — they have one for their code field type
- Must have CSS syntax highlighting
- Larger textarea-like area, not a single-line input

### Tailwind Classes Input
- Tag-based token input (like browser DevTools class editor)
- Each class appears as a removable tag/chip
- Type to add, click X to remove
- NOT a plain text input where you type space-separated classes

### Theme Field Components
- Redesign ColorPicker: sleek, Payload-native look
- Redesign SliderField: professional, clean
- Redesign FontSelector: polished dropdown
- All must look like they belong in Payload admin, not bolted on

### Visual Grouping
- Theme settings page should have clean visual sections
- Use Payload's native group/card styling patterns

</decisions>

<specifics>
## Specific Ideas

- Reference Webflow's styling panel for bounding box and property controls
- Reference Shopify theme customizer for CSS code input
- Reference browser DevTools for class token input
- Use Payload's code field component for CSS editor
- Import from @payloadcms/ui where components exist (buttons, inputs, selects, etc.)

</specifics>
