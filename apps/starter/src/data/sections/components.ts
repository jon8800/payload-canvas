// The "Components" demo page: one section for each of the plugin's opt-in built-in blocks.
// The seed runs the result through `withDefaultClassNames`, so the built-ins get their default
// part classes (carousel arrows, popup panel, tab buttons).
import type { Block } from 'payload-canvas/core'
import { embed, grid, heading, icon, image, sectionHeader, slotted, stack, styles, text } from './build'
import { hero } from './hero'

type Photo = { id: number | string; alt: string }

// Custom code for the Embed section. Inline: a script fills in the line (the canvas never runs it).
const INLINE_CODE = `<p>This line waits for its script.</p>
<script>
  document.currentScript.previousElementSibling.textContent = 'A script in the page wrote this line.'
</script>`

// Isolated: its own frame, with its own styles. It cannot reach the page.
const FRAME_CODE = `<style>
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #1f2937; }
  .card { display: flex; justify-content: space-between; padding: 16px 20px; border: 1px solid #e5e7eb; border-radius: 12px; }
</style>
<div class="card"><strong>Opening hours</strong><span>Monday to Friday, 9 to 5</span></div>`

const section = (width: string, children: Block[]) =>
  stack('section', 'px-5 py-16 md:px-8', [stack('div', `mx-auto flex w-full ${width} flex-col gap-8`, children)])

export function componentsPage(media: Record<string, Photo>): Block[] {
  const work = [
    { title: 'Linden Bakery', meta: 'Ordering site and weekly menu', photo: media['work-bakery']! },
    { title: 'Hale Architects', meta: 'Portfolio and project archive', photo: media['work-architects']! },
    { title: 'Riverside Arts', meta: 'Festival programme and venues', photo: media['work-festival']! },
    { title: 'Oakmoor Clinic', meta: 'Service pages and appointments', photo: media['work-clinic']! },
  ]
  return [
    hero.create({ title: 'Components', text: 'The built-in blocks: icons, an accordion, a carousel, tabs, popups, an embed and a marquee.' }),
    section('max-w-6xl', [
      sectionHeader('Icons', 'An icon block takes a name from the site icon set.'),
      stack(
        'ul',
        'grid grid-cols-2 gap-6 md:grid-cols-4',
        [
          ['sparkles', 'Design'],
          ['check', 'Build'],
          ['star', 'Launch'],
          ['mail', 'Support'],
        ].map(([name = '', label = '']) => stack('li', 'flex items-center gap-3', [icon(name, 'size-6 text-primary'), text(label, 'text-lg font-medium')])),
      ),
    ]),
    section('max-w-3xl', [
      heading('Accordion', '2', styles.sectionTitle),
      slotted('accordion', { faqSchema: true }, 'flex flex-col divide-y border-y border-border', {
        items: [
          ['How long does a project take?', 'Most sites launch in four to eight weeks.'],
          ['Can we edit the site ourselves?', 'Yes. Every page is built with blocks in the visual builder.'],
          ['Do you host the site?', 'We deploy to your server or a VPS of your choice.'],
        ].map(([question = '', answer = '']) =>
          slotted('disclosure', undefined, 'py-4', {
            summary: [text(question, 'text-lg font-medium')],
            content: [text(answer, 'pt-3 text-muted-foreground')],
          }),
        ),
      }),
    ]),
    section('max-w-6xl', [
      heading('Carousel', '2', styles.sectionTitle),
      slotted('carousel', { dots: true }, undefined, {
        slides: work.map(({ title, meta, photo }) =>
          stack('article', 'flex min-w-0 shrink-0 grow-0 basis-[85%] flex-col gap-3 md:basis-[40%]', [
            image(photo.id, `${title} website`, 'aspect-[4/3] w-full rounded-lg object-cover'),
            heading(title, '3', 'text-xl font-semibold'),
            text(meta, 'text-muted-foreground'),
          ]),
        ),
      }),
    ]),
    section('max-w-3xl', [
      heading('Tabs', '2', styles.sectionTitle),
      slotted('tabs', { label: 'How we work' }, undefined, {
        tabs: [
          ['Design', 'We start with a short workshop and a design system built from theme tokens.'],
          ['Build', 'Pages are built with blocks, so your team can change them later.'],
          ['Launch', 'We deploy to your server and train your editors.'],
        ].map(([label = '', body = '']) => slotted('tab', { label }, undefined, { content: [text(body, 'text-lg text-muted-foreground')] })),
      }),
    ]),
    section('max-w-6xl', [
      sectionHeader('Popup', 'Click a photo to open it larger. A popup can hold any blocks.'),
      grid(
        'grid grid-cols-2 gap-4 md:grid-cols-3',
        [media['studio-desk']!, media['workshop-wall']!, media['work-festival']!].map((photo) =>
          slotted('popup', { label: photo.alt }, undefined, {
            trigger: [image(photo.id, photo.alt, 'aspect-square w-full cursor-zoom-in rounded-lg object-cover')],
            content: [image(photo.id, photo.alt, 'max-h-[80vh] w-full rounded-md object-contain'), text(photo.alt, 'pt-3 text-muted-foreground')],
          }),
        ),
      ),
    ]),
    section('max-w-3xl', [
      sectionHeader('Embed', 'Custom HTML: in the page, or in its own frame.'),
      embed({ code: INLINE_CODE }, 'w-full'),
      embed({ code: FRAME_CODE, mode: 'isolated', title: 'Opening hours' }, 'h-20 w-full'),
    ]),
    stack('section', 'border-y border-border py-10', [
      slotted('marquee', { speed: 'normal', pauseOnHover: true }, undefined, {
        children: work.map(({ title }) => text(title, 'font-display text-3xl whitespace-nowrap text-muted-foreground')),
      }),
    ]),
  ]
}
