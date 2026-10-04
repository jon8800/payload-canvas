// Demo images for the seed, drawn as SVG and rendered with sharp. No network and no stock photos.
// - Work: four fictional client sites in a browser window (Home "Selected work").
// - Studio and workshop: a desk and a sitemap wall (image and text sections).
// - Posts: three flat editorial compositions (blog cards and the services cards).
// A light film grain goes over every image, so the flat shapes read as printed, not as placeholders.
import sharp from 'sharp'

export type DemoImage = { name: string; alt: string; width: number; height: number; svg: () => string }

const INK = '#1c1b18'
const PAPER = '#f5f2eb'
const GREEN = '#1f4536'
const CLAY = '#c65d3b'
const SAND = '#e3d7c3'
const MUSTARD = '#e2a93b'

const SERIF = "Georgia, 'Times New Roman', serif"
const SANS = 'Arial, Helvetica, sans-serif'
const MONO = "'Courier New', Courier, monospace"

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

type TextOptions = { family?: string; weight?: number | string; anchor?: 'start' | 'middle' | 'end'; spacing?: number; style?: string; opacity?: number }

function text(x: number, y: number, size: number, fill: string, content: string, options: TextOptions = {}): string {
  const { family = SANS, weight = 400, anchor = 'start', spacing = 0, style = 'normal', opacity = 1 } = options
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" font-style="${style}" letter-spacing="${spacing}" text-anchor="${anchor}" fill="${fill}" fill-opacity="${opacity}">${esc(content)}</text>`
}

const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 0, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`

/** A soft shadow under a box: a blurred dark copy, offset down. */
const shadow = (x: number, y: number, w: number, h: number, rx: number, opacity = 0.22, dy = 28) =>
  `<rect x="${x}" y="${y + dy}" width="${w}" height="${h}" rx="${rx}" fill="#000" fill-opacity="${opacity}" filter="url(#soft)"/>`

const pill = (x: number, y: number, w: number, h: number, fill: string, label: string, color: string, size = 17, stroke?: string) =>
  rect(x, y, w, h, fill, h / 2, stroke ? `stroke="${stroke}" stroke-width="1.5"` : '') +
  text(x + w / 2, y + h / 2 + size * 0.36, size, color, label, { anchor: 'middle', weight: 600 })

function svg(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="26"/></filter>
  <filter id="softSm" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="8"/></filter>
</defs>
${body}
</svg>`
}

/** A browser window that runs off the bottom edge, with the site drawn inside at (0, 0). */
function browser(width: number, height: number, backdrop: string, siteBg: string, domain: string, site: string): string {
  const x = 120
  const y = 110
  const w = width - 240
  const h = height - 60
  const bar = 54
  return svg(
    width,
    height,
    `${rect(0, 0, width, height, backdrop)}
${shadow(x, y, w, h, 16, 0.25, 34)}
<clipPath id="window"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16"/></clipPath>
<g clip-path="url(#window)">
  ${rect(x, y, w, h, siteBg)}
  ${rect(x, y, w, bar, '#eeebe5')}
  <circle cx="${x + 30}" cy="${y + bar / 2}" r="7" fill="#d6d1c7"/>
  <circle cx="${x + 54}" cy="${y + bar / 2}" r="7" fill="#d6d1c7"/>
  <circle cx="${x + 78}" cy="${y + bar / 2}" r="7" fill="#d6d1c7"/>
  ${rect(x + w / 2 - 230, y + 13, 460, 28, '#ffffff', 14)}
  ${text(x + w / 2, y + 32, 15, '#77726a', domain, { anchor: 'middle' })}
  <g transform="translate(${x} ${y + bar})">${site}</g>
</g>`,
  )
}

// Site content is drawn in a 1360 px wide window.

function bakerySite(): string {
  const brown = '#5a2e1a'
  const dark = '#3b1d10'
  return `${text(56, 58, 32, brown, 'Linden', { family: SERIF, style: 'italic' })}
${['Breads', 'Cakes', 'Visit'].map((label, i) => text(760 + i * 110, 56, 18, brown, label)).join('')}
${pill(1100, 30, 200, 44, '#8a3b1f', 'Order ahead', '#fff8ef')}
${text(56, 230, 76, dark, 'Fresh bread,', { family: SERIF })}
${text(56, 314, 76, dark, 'every morning.', { family: SERIF })}
${text(56, 380, 22, '#6b4a3a', 'Sourdough, rye and pastries from our')}
${text(56, 412, 22, '#6b4a3a', 'small oven on Mill Street.')}
${pill(56, 450, 230, 54, '#8a3b1f', 'See today’s menu', '#fff8ef', 18)}
${pill(302, 450, 140, 54, 'none', 'Find us', brown, 18, brown)}
${rect(720, 120, 584, 420, '#ecd3b2', 14)}
<ellipse cx="930" cy="400" rx="190" ry="96" fill="#c4874f"/>
<path d="M800 380 q130 -70 260 0 M820 420 q110 -60 220 0" stroke="#9c6236" stroke-width="7" fill="none" stroke-linecap="round"/>
<circle cx="1170" cy="300" r="92" fill="#b57843"/>
<path d="M1120 300 l100 0 M1170 250 l0 100" stroke="#8f5a30" stroke-width="7" stroke-linecap="round"/>
<circle cx="1180" cy="460" r="50" fill="#d9a36a"/>
${[0, 1, 2].map((i) => {
  const cx = 56 + i * 424
  const labels = ['Country loaf', 'Rye and seeds', 'Cardamom buns']
  const tones = ['#f0dcc0', '#e7cfae', '#f3e2c9']
  const shapes = [
    `<ellipse cx="${cx + 200}" cy="730" rx="120" ry="62" fill="#c4874f"/><path d="M${cx + 120} 720 q80 -40 160 0" stroke="#9c6236" stroke-width="6" fill="none" stroke-linecap="round"/>`,
    `<rect x="${cx + 90}" y="670" width="220" height="120" rx="20" fill="#8a5a36"/>${[0, 1, 2, 3, 4].map((d) => `<circle cx="${cx + 120 + d * 40}" cy="${700 + (d % 2) * 30}" r="5" fill="#e7cfae"/>`).join('')}`,
    `${[0, 1, 2].map((d) => `<circle cx="${cx + 120 + d * 80}" cy="${730 - (d % 2) * 20}" r="44" fill="#d9a36a"/><path d="M${cx + 100 + d * 80} ${730 - (d % 2) * 20} q20 -16 40 0" stroke="#a86a3a" stroke-width="5" fill="none" stroke-linecap="round"/>`).join('')}`,
  ]
  return rect(cx, 600, 400, 240, tones[i], 12) + shapes[i] + text(cx + 24, 880, 24, dark, labels[i], { family: SERIF })
}).join('')}`
}

function architectSite(): string {
  return `${text(56, 60, 24, '#111', 'HALE', { weight: 700, spacing: 6 })}
${['Projects', 'Studio', 'Journal', 'Contact'].map((label, i) => text(860 + i * 112, 58, 18, '#333', label)).join('')}
${text(56, 210, 84, '#111', 'Buildings that', { spacing: -2 })}
${text(56, 300, 84, '#111', 'age well.', { spacing: -2 })}
${text(900, 236, 20, '#555', 'An architecture practice for')}
${text(900, 266, 20, '#555', 'libraries, schools and homes.')}
${rect(56, 350, 1248, 560, '#d5dade')}
<polygon points="56,910 56,620 420,520 420,910" fill="#b8bec2"/>
<polygon points="420,910 420,520 980,600 980,910" fill="#9aa1a6"/>
<polygon points="980,910 980,600 1304,660 1304,910" fill="#c3c8cb"/>
${[0, 1, 2, 3, 4].map((i) => rect(470 + i * 98, 640 + i * 6, 58, 150, '#2b3034')).join('')}
${[0, 1, 2].map((i) => rect(110 + i * 96, 660 - i * 26, 50, 130, '#3a4044')).join('')}
<polygon points="56,910 1304,910 1304,860 300,860" fill="#7f878c" fill-opacity="0.55"/>
${text(56, 950, 17, '#666', 'Riverside Library')}`
}

function festivalSite(): string {
  const yellow = '#ffd23f'
  return `${text(56, 60, 24, '#fff', 'Riverside Arts', { weight: 700 })}
${['Programme', 'Venues', 'Visit'].map((label, i) => text(820 + i * 128, 58, 18, '#e8ecff', label)).join('')}
${pill(1176, 30, 128, 44, yellow, 'Tickets', '#1d2b6b')}
<circle cx="1020" cy="330" r="210" fill="${yellow}"/>
${[0, 1, 2, 3].map((i) => `<path d="M600 ${470 + i * 34} q60 -26 120 0 t120 0 t120 0 t120 0 t120 0 t120 0" stroke="#ff7aa8" stroke-width="12" fill="none" stroke-linecap="round" stroke-opacity="${1 - i * 0.2}"/>`).join('')}
${text(56, 230, 92, '#fff', 'Twelve days', { weight: 700, spacing: -2 })}
${text(56, 330, 92, '#fff', 'of music', { weight: 700, spacing: -2 })}
${text(56, 330 + 100, 92, '#ff7aa8', 'and art.', { weight: 700, spacing: -2 })}
${text(60, 500, 22, yellow, '14 to 25 July · Free events every day')}
${[
  ['FRI 14', 'Opening night on the river'],
  ['SAT 15', 'Print market and open studios'],
  ['SUN 16', 'Choirs in the park'],
].map(([date, title], i) => {
  const y = 610 + i * 96
  return `<line x1="56" y1="${y - 46}" x2="1304" y2="${y - 46}" stroke="#ffffff" stroke-opacity="0.25" stroke-width="1.5"/>` +
    text(56, y, 22, yellow, date, { weight: 700 }) + text(220, y, 30, '#fff', title)
}).join('')}`
}

function clinicSite(): string {
  const green = '#2f5d43'
  return `<circle cx="72" cy="50" r="16" fill="#8fb39a"/>
${text(100, 60, 30, '#24412f', 'Oakmoor', { family: SERIF })}
${['Services', 'Our team', 'Visit'].map((label, i) => text(780 + i * 116, 58, 18, '#3d5a47', label)).join('')}
${pill(1124, 30, 180, 44, green, 'Book a visit', '#f3f6f1')}
${text(56, 240, 70, '#1f3527', 'Care that fits', { family: SERIF })}
${text(56, 322, 70, '#1f3527', 'your week.', { family: SERIF })}
${text(56, 390, 22, '#4f6658', 'Evening and weekend visits, booked online')}
${text(56, 422, 22, '#4f6658', 'in under a minute.')}
<circle cx="560" cy="700" r="210" fill="#dfe8da"/>
<circle cx="380" cy="760" r="120" fill="#c9dac4"/>
${shadow(800, 130, 500, 560, 18, 0.16, 20)}
${rect(800, 130, 500, 560, '#ffffff', 18)}
${text(840, 196, 30, '#1f3527', 'Book a visit', { family: SERIF })}
${['Service', 'Day', 'Time'].map((label, i) => {
  const y = 240 + i * 112
  return text(840, y + 16, 16, '#4f6658', label, { weight: 600 }) + rect(840, y + 30, 420, 54, '#ffffff', 8, 'stroke="#9fb2a5" stroke-width="1.5"')
}).join('')}
${text(860, 306, 18, '#1f3527', 'General check-up')}
${text(860, 418, 18, '#1f3527', 'Thursday')}
${text(860, 530, 18, '#1f3527', '18:30')}
${pill(840, 604, 420, 56, green, 'See times', '#f3f6f1', 18)}`
}

function studioDesk(): string {
  const swatches = [GREEN, CLAY, MUSTARD, SAND, INK]
  return svg(
    1600,
    1200,
    `${rect(0, 0, 1600, 1200, '#d6c8b1')}
<g transform="rotate(-4 560 660)">
  ${shadow(190, 170, 760, 980, 6, 0.2, 22)}
  ${rect(190, 170, 760, 980, '#fbf9f4', 6)}
  <g stroke="${INK}" stroke-opacity="0.72" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M250 250 h120 M640 250 h240"/>
    <path d="M250 330 h420 M250 380 h320"/>
    <rect x="250" y="440" width="640" height="330" rx="6"/>
    <path d="M250 440 L890 770 M890 440 L250 770"/>
    <path d="M250 840 h200 M250 880 h170 M250 920 h190"/>
    <path d="M520 840 h200 M520 880 h170 M520 920 h190"/>
    <rect x="250" y="990" width="170" height="54" rx="27"/>
  </g>
</g>
<g transform="rotate(7 1180 360)">
  ${shadow(990, 190, 420, 330, 6, 0.18, 18)}
  ${rect(990, 190, 420, 330, '#ffffff', 6)}
  ${text(1040, 400, 190, INK, 'Aa', { family: SERIF })}
  ${text(1300, 470, 22, '#77726a', 'Display', { anchor: 'end', family: SANS })}
</g>
${swatches.map((color, i) => {
  const angle = -46 + i * 12
  return `<g transform="rotate(${angle} 1210 1080)">
  ${shadow(1130, 640, 160, 420, 8, 0.18, 14)}
  ${rect(1130, 640, 160, 420, '#fbf9f4', 8)}
  ${rect(1142, 652, 136, 300, color, 4)}
  ${text(1150, 1000, 20, '#55514a', color.toUpperCase(), { family: MONO })}
</g>`
}).join('')}
<g transform="rotate(-28 980 1040)">
  ${shadow(700, 1020, 540, 30, 15, 0.22, 10)}
  ${rect(700, 1020, 540, 30, MUSTARD, 4)}
  ${rect(1210, 1020, 40, 30, '#e9d6b0')}
  <polygon points="1250,1020 1300,1035 1250,1050" fill="#e9d6b0"/>
  <polygon points="1282,1029 1300,1035 1282,1041" fill="${INK}"/>
</g>`,
  )
}

/** A sitemap connector: down, across, down. */
const connector = (x1: number, y1: number, x2: number, y2: number) =>
  `<path d="M${x1} ${y1} V${(y1 + y2) / 2} H${x2} V${y2}" stroke="${INK}" stroke-opacity="0.45" stroke-width="3" fill="none"/>`

function workshopWall(): string {
  const card = (cx: number, cy: number, label: string, w = 230) =>
    `${shadow(cx - w / 2, cy - 48, w, 96, 10, 0.16, 12)}${rect(cx - w / 2, cy - 48, w, 96, '#ffffff', 10)}${text(cx, cy + 10, 30, INK, label, { anchor: 'middle', family: SERIF })}`
  const note = (x: number, y: number, color: string, angle: number) =>
    `<g transform="rotate(${angle} ${x + 90} ${y + 90})">${shadow(x, y, 180, 180, 2, 0.14, 10)}${rect(x, y, 180, 180, color, 2)}
<path d="M${x + 26} ${y + 60} q30 -10 60 0 t60 0 M${x + 26} ${y + 100} q26 -8 52 0 t52 0" stroke="${INK}" stroke-opacity="0.55" stroke-width="4" fill="none" stroke-linecap="round"/></g>`
  return svg(
    1600,
    1200,
    `${rect(0, 0, 1600, 1200, '#e8e2d6')}
${connector(800, 250, 290, 470)}${connector(800, 250, 630, 470)}${connector(800, 250, 970, 470)}${connector(800, 250, 1310, 470)}
${connector(630, 520, 470, 760)}${connector(630, 520, 790, 760)}
${card(800, 200, 'Home', 260)}
${card(290, 470, 'Work')}
${card(630, 470, 'Services')}
${card(970, 470, 'About')}
${card(1310, 470, 'Contact')}
${card(470, 760, 'Design')}
${card(790, 760, 'Build')}
${note(1080, 700, '#f2d16b', 6)}
${note(1290, 760, '#efb3c0', -5)}
${note(150, 760, '#b9d5b2', -7)}
${note(1180, 960, '#f2d16b', 3)}`,
  )
}

function blocksComposition(): string {
  return svg(
    1600,
    1000,
    `${rect(0, 0, 1600, 1000, PAPER)}
${rect(120, 120, 760, 470, GREEN, 6)}
${rect(904, 120, 576, 220, CLAY, 6)}
${rect(904, 364, 276, 226, SAND, 6)}
${rect(1204, 364, 276, 226, INK, 6)}
<circle cx="1342" cy="477" r="78" fill="${MUSTARD}"/>
${rect(120, 614, 360, 266, MUSTARD, 6)}
${rect(504, 614, 376, 266, SAND, 6)}
${rect(904, 614, 576, 266, GREEN, 6, 'fill-opacity="0.85"')}
${[0, 1, 2].map((i) => rect(184, 200 + i * 56, 420 - i * 90, 22, PAPER, 11, 'fill-opacity="0.9"')).join('')}
${rect(184, 470, 180, 56, PAPER, 28)}
${[0, 1, 2, 3].map((i) => rect(560, 680 + i * 46, 260 - i * 40, 16, INK, 8, 'fill-opacity="0.75"')).join('')}`,
  )
}

function launchComposition(): string {
  const rings = [620, 520, 420, 320]
  return svg(
    1600,
    1000,
    `${rect(0, 0, 1600, 1000, GREEN)}
${rings.map((r, i) => `<circle cx="800" cy="1000" r="${r}" fill="none" stroke="${PAPER}" stroke-opacity="${0.1 + i * 0.06}" stroke-width="2"/>`).join('')}
<circle cx="800" cy="720" r="220" fill="${CLAY}"/>
${rect(0, 760, 1600, 240, GREEN)}
${[0, 1, 2, 3, 4].map((i) => rect(0, 780 + i * 44, 1600, 14, PAPER, 0, `fill-opacity="${0.85 - i * 0.16}"`)).join('')}
<circle cx="1260" cy="230" r="10" fill="${PAPER}"/>
<circle cx="380" cy="300" r="6" fill="${PAPER}" fill-opacity="0.7"/>
<circle cx="1080" cy="140" r="5" fill="${PAPER}" fill-opacity="0.6"/>`,
  )
}

function tokensComposition(): string {
  const colors = [INK, GREEN, '#3f7a5f', CLAY, MUSTARD, SAND, PAPER]
  const w = 1600 / colors.length
  return svg(
    1600,
    1000,
    `${colors.map((color, i) => rect(Math.round(i * w), 0, Math.ceil(w) + 1, 1000, color)).join('')}
${colors.map((color, i) => {
  const light = i >= 4
  const ink = light ? INK : PAPER
  const x = Math.round(i * w) + 28
  return `<circle cx="${x + 26}" cy="760" r="26" fill="none" stroke="${ink}" stroke-opacity="0.7" stroke-width="2"/>` +
    text(x, 850, 26, ink, color.toUpperCase(), { family: MONO, opacity: 0.85 }) +
    text(x, 892, 20, ink, `--color-${['ink', 'primary', 'leaf', 'clay', 'sun', 'sand', 'paper'][i]}`, { family: MONO, opacity: 0.6 })
}).join('')}`,
  )
}

export const WORK_IMAGES: DemoImage[] = [
  {
    name: 'demo-work-bakery.jpg',
    alt: 'The Linden Bakery home page: a serif headline, a menu button and a drawing of loaves',
    width: 1600,
    height: 1200,
    svg: () => browser(1600, 1200, '#cfb89c', '#fbf4e8', 'lindenbakery.example', bakerySite()),
  },
  {
    name: 'demo-work-architects.jpg',
    alt: 'The Hale Architects home page: a large headline above a wide picture of a concrete building',
    width: 1600,
    height: 1200,
    svg: () => browser(1600, 1200, '#c3c8cb', '#ffffff', 'hale-architects.example', architectSite()),
  },
  {
    name: 'demo-work-festival.jpg',
    alt: 'The Riverside Arts festival site: a yellow sun over pink waves and a list of events on dark blue',
    width: 1600,
    height: 1200,
    svg: () => browser(1600, 1200, '#e6a3b6', '#1d2b6b', 'riversidearts.example', festivalSite()),
  },
  {
    name: 'demo-work-clinic.jpg',
    alt: 'The Oakmoor clinic site: a calm green page with a booking card for a visit',
    width: 1600,
    height: 1200,
    svg: () => browser(1600, 1200, '#b7c6b1', '#f3f6f1', 'oakmoor.example', clinicSite()),
  },
]

export const STUDIO_IMAGES: DemoImage[] = [
  {
    name: 'demo-studio-desk.jpg',
    alt: 'A studio desk: a page wireframe sketch, a type card and a fan of brand color swatches',
    width: 1600,
    height: 1200,
    svg: studioDesk,
  },
  {
    name: 'demo-workshop-wall.jpg',
    alt: 'A workshop wall with a sitemap drawn in cards and sticky notes',
    width: 1600,
    height: 1200,
    svg: workshopWall,
  },
]

export const POST_IMAGES: DemoImage[] = [
  { name: 'demo-post-blocks.jpg', alt: 'Colored blocks arranged like a page layout', width: 1600, height: 1000, svg: blocksComposition },
  { name: 'demo-post-launch.jpg', alt: 'A clay-red sun rising over striped water on deep green', width: 1600, height: 1000, svg: launchComposition },
  { name: 'demo-post-tokens.jpg', alt: 'Seven color swatches in vertical bands, labeled with their hex values', width: 1600, height: 1000, svg: tokensComposition },
]

export const DEMO_IMAGES = [...WORK_IMAGES, ...STUDIO_IMAGES, ...POST_IMAGES]

/** Renders an image to JPEG with a light grain. */
export async function renderDemoImage(image: DemoImage): Promise<Buffer> {
  const base = await sharp(Buffer.from(image.svg())).png().toBuffer()
  const grain = await sharp({
    create: { width: image.width, height: image.height, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 28 } },
  })
    .greyscale()
    .ensureAlpha(0.07)
    .png()
    .toBuffer()
  return sharp(base)
    .composite([{ input: grain, blend: 'overlay' }])
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer()
}
