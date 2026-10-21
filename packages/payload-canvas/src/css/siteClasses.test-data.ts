/**
 * The escort-starter's `src/app/(frontend)/globals.css` (2026-10-22): 41 `@utility` rules, 32 with a
 * `@canvas Group: Label` comment, 10 of them right after another comment.
 */
export const STARTER_GLOBALS_CSS = `@import 'tailwindcss';
@import 'tw-animate-css';
@import 'shadcn/tailwind.css';
@plugin '@tailwindcss/typography';

@custom-variant dark (&:is(.dark *));
@custom-variant reduce-transparency (@media (prefers-reduced-transparency: reduce));
/* Bento caption sizes follow the tile, not the viewport: container queries on the \`tile\` container. */
@custom-variant tile-sm {
  @container tile (width < 20rem) or (height < 15rem) {
    @slot;
  }
}
@custom-variant tile-lg {
  @container tile (width >= 26rem) and (height >= 20rem) {
    @slot;
  }
}

/* Design tokens. Dark ground, light type, one accent colour (--brand in :root below).
   A new site restyles here: change --brand, the ground and ink greys, and the fonts in layout.tsx.
   Fonts are loaded by next/font in src/app/(frontend)/layout.tsx. Everything else is Tailwind utilities in components. */
@theme {
  --font-display: var(--font-display-face), system-ui, sans-serif;
  --font-sans: var(--font-sans-face), system-ui, sans-serif;

  --color-ground: #0b0b0c;
  --color-ground-2: #111113;
  --color-ink: #f4f4f5;
  --color-ink-soft: rgba(244, 244, 245, 0.78);
  --color-ink-muted: #9d9da3;
  --color-hairline: rgba(255, 255, 255, 0.1);
  --color-hairline-strong: rgba(255, 255, 255, 0.16);
  --color-glass: rgba(255, 255, 255, 0.04);
  --color-glass-2: rgba(255, 255, 255, 0.07);

  --ease-out-soft: cubic-bezier(0.2, 0.7, 0.2, 1);
  --ease-liquid: cubic-bezier(0.22, 1, 0.36, 1);
  --container-content: 88rem;
}

/* The accent and its shades, all mixed from the one --brand variable. */
@theme inline {
  --color-brand: var(--brand);
  --color-brand-soft: var(--brand-soft);
  --color-brand-strong: var(--brand-strong);
  --color-brand-vivid: var(--brand-vivid);
  --color-brand-ink: var(--brand-ink);
}

/* shadcn semantic tokens mapped onto the palette */
@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);
  --radius-3xl: calc(var(--radius) + 12px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
}

:root {
  /* The one accent colour. The shades below mix from it. */
  --brand: #7c9cff;
  --brand-soft: color-mix(in oklab, var(--brand) 55%, white);
  --brand-strong: color-mix(in oklab, var(--brand) 75%, black);
  --brand-vivid: color-mix(in oklab, var(--brand) 88%, black);
  --brand-ink: color-mix(in oklab, var(--brand) 35%, black);
  --radius: 1rem;
  --background: #0b0b0c;
  --foreground: #f4f4f5;
  --card: #111113;
  --card-foreground: #f4f4f5;
  --popover: #111113;
  --popover-foreground: #f4f4f5;
  --primary: var(--brand);
  --primary-foreground: #121214;
  --secondary: rgba(255, 255, 255, 0.06);
  --secondary-foreground: #f4f4f5;
  --muted: rgba(255, 255, 255, 0.06);
  --muted-foreground: #9d9da3;
  --accent: rgba(255, 255, 255, 0.07);
  --accent-foreground: #f4f4f5;
  --destructive: #e5484d;
  --border: rgba(255, 255, 255, 0.1);
  --input: rgba(255, 255, 255, 0.4);
  --ring: var(--brand);
  --accent-gradient: linear-gradient(
    120deg,
    var(--brand-soft) 0%,
    var(--brand-soft) 45%,
    var(--brand-strong) 100%
  );
  --pill-gradient: linear-gradient(
    120deg,
    var(--brand-soft) 0%,
    var(--brand) 52%,
    var(--brand-strong) 100%
  );

  /* Liquid Glass. Pill Ink text stays at 4.7:1 or more on every gradient stop. */
  --liquid-gradient: linear-gradient(
    110deg,
    var(--brand-soft) 0%,
    var(--brand-soft) 24%,
    var(--brand-strong) 48%,
    var(--brand-strong) 70%,
    var(--brand-strong) 86%,
    var(--brand-soft) 100%
  );
  --glass-sheen: linear-gradient(
    165deg,
    color-mix(in oklab, var(--brand-soft) 9%, transparent) 0%,
    rgba(255, 255, 255, 0.025) 38%,
    color-mix(in oklab, var(--brand-strong) 5%, transparent) 100%
  );
  --glass-rim: linear-gradient(
    160deg,
    rgba(255, 255, 255, 0.34) 0%,
    color-mix(in oklab, var(--brand-soft) 12%, transparent) 26%,
    rgba(255, 255, 255, 0.04) 55%,
    color-mix(in oklab, var(--brand) 26%, transparent) 100%
  );
  --glass-lit:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    inset 0 0 32px color-mix(in oklab, var(--brand) 6%, transparent);
  --rule-brand: linear-gradient(
    90deg,
    color-mix(in oklab, var(--brand) 55%, transparent),
    rgba(255, 255, 255, 0.1) 32%,
    rgba(255, 255, 255, 0.1)
  );
}

/* Per-element glass settings. inherits: false keeps a heavy bar from tinting the glass nested in it. */
@property --glass-tint {
  syntax: '<color>';
  inherits: false;
  initial-value: rgba(255, 255, 255, 0.025);
}
@property --glass-blur {
  syntax: '<length>';
  inherits: false;
  initial-value: 20px;
}
@property --glass-drop {
  syntax: '*';
  inherits: false;
  initial-value: 0 0 #0000;
}

/* Custom utilities for the few things Tailwind cannot express inline */
/* @canvas Effects: Accent gradient text */
@utility text-accent-gradient {
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
@utility bg-pill-gradient {
  background: var(--pill-gradient);
}
/* Liquid Glass panel: accent-tinted translucent fill, blur and saturation, a gradient rim that is
   brightest at the top-left (the lit edge), and a soft inner glow. The rim is ::after. */
/* @canvas Effects: Glass */
@utility glass {
  position: relative;
  background: var(--glass-sheen), var(--glass-tint);
  border: 1px solid rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(var(--glass-blur)) saturate(165%);
  box-shadow: var(--glass-lit), var(--glass-drop);
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: inherit;
    padding: 1px;
    background: var(--glass-rim);
    mask:
      linear-gradient(#000 0 0) content-box exclude,
      linear-gradient(#000 0 0);
    pointer-events: none;
  }
  @media (prefers-reduced-transparency: reduce) {
    background: #161618;
    backdrop-filter: none;
  }
  @media (prefers-contrast: more) {
    border-color: rgba(255, 255, 255, 0.45);
  }
}
/* Heavier glass for floating chrome (header, mega menu, mobile sheet): darker tint, stronger blur, drop. */
/* @canvas Effects: Heavy glass */
@utility glass-bar {
  --glass-tint: rgba(16, 16, 18, 0.62);
  --glass-blur: 28px;
  --glass-drop: 0 14px 44px rgba(0, 0, 0, 0.38);
}
/* Hero-scale lensing: a specular bloom top-left and accent light bending in bottom-right. ::before. */
/* @canvas Effects: Glass lens */
@utility glass-lens {
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background:
      radial-gradient(90% 55% at 12% -8%, rgba(255, 255, 255, 0.11), transparent 62%),
      radial-gradient(
        70% 60% at 100% 112%,
        color-mix(in oklab, var(--brand-strong) 20%, transparent),
        transparent 70%
      );
    pointer-events: none;
  }
}
/* Primary pill: accent gradient under a top specular band. When the Liquid Glass runtime makes it
   refract (data-refracting), the gradient fills the padding box and the 1px border is the only clear
   glass: one rim that bends the backdrop and takes the specular light from the top left. The label keeps
   its 4.7:1 contrast on the opaque fill. */
@utility liquid-fill {
  --liquid-fill:
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.42) 0%,
      rgba(255, 255, 255, 0.1) 46%,
      rgba(255, 255, 255, 0) 54%,
      rgba(255, 255, 255, 0.14) 100%
    ),
    var(--liquid-gradient);
  background-image: var(--liquid-fill);
  background-size:
    100% 100%,
    200% 100%;
  background-position:
    0 0,
    18% 50%;
  &[data-refracting] {
    background: color-mix(in oklab, var(--brand) 14%, transparent);
    border-color: color-mix(in oklab, var(--brand-soft) 34%, transparent);
    &::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -2;
      border-radius: inherit;
      background-image: var(--liquid-fill);
      background-size:
        100% 100%,
        200% 100%;
      background-position:
        0 0,
        18% 50%;
      box-shadow: inset 0 -1px 0 color-mix(in oklab, var(--brand-ink) 28%, transparent);
    }
  }
}
/* Clear glass pill for secondary actions. */
@utility liquid-clear {
  background:
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.13) 0%,
      rgba(255, 255, 255, 0.03) 50%,
      color-mix(in oklab, var(--brand) 8%, transparent) 100%
    ),
    rgba(20, 20, 22, 0.35);
  backdrop-filter: blur(16px) saturate(180%);
  @media (prefers-reduced-transparency: reduce) {
    background: #19191b;
    backdrop-filter: none;
  }
}
/* Interactive glass light. A soft light sits under the pointer (--lx, --ly, set by the Liquid Glass
   runtime), shows on hover and focus, and flares on press (data-pressed). --sheen sets its colour. */
@utility liquid-sheen {
  position: relative;
  isolation: isolate;
  overflow: clip;
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: radial-gradient(
      circle 5.5rem at var(--lx, 50%) var(--ly, 0%),
      var(--sheen, rgba(255, 255, 255, 0.55)),
      transparent 100%
    );
    opacity: 0;
    transition: opacity 300ms var(--ease-liquid);
    pointer-events: none;
  }
  &:hover::after,
  &:focus-visible::after {
    opacity: 0.75;
  }
  &[data-pressed]::after {
    opacity: 1;
    transition-duration: 80ms;
  }
}
/* Marks an element for the Liquid Glass press (swell, stretch, spring back). A link would otherwise
   start a native drag, which cancels the pointer mid-stretch. */
@utility liquid-press {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  -webkit-user-drag: none;
  & img {
    -webkit-user-drag: none;
  }
}
/* Interactive glass card: the pill's language at card scale. A soft light follows the pointer (--lx,
   --ly) and a lit rim fades in with it on hover and focus; both flare on press. Add liquid-press for
   the swell, which the settings below hold to 1.8% with no drag stretch, so a card never reaches its
   neighbours. The light sits under the content (--light-z: -1); photo cards lift it over the photo
   (--light-z: 1) and keep their caption above it. The element's own box-shadow stays free for focus. */
@utility liquid-card {
  --press-swell: 0.018;
  --press-stretch: 0;
  position: relative;
  isolation: isolate;
  -webkit-tap-highlight-color: transparent;
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: var(--light-z, -1);
    border-radius: inherit;
    background: radial-gradient(
      circle 14rem at var(--lx, 50%) var(--ly, 0%),
      var(--sheen, color-mix(in oklab, var(--brand-soft) 12%, transparent)),
      transparent 100%
    );
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.24),
      inset 0 0 0 1px color-mix(in oklab, var(--brand-soft) 20%, transparent),
      inset 0 0 36px color-mix(in oklab, var(--brand) 10%, transparent);
    opacity: 0;
    transition: opacity 300ms var(--ease-liquid);
    pointer-events: none;
  }
  &:hover::before,
  &:focus-visible::before {
    opacity: 1;
  }
  &:active,
  &[data-pressed] {
    --sheen: color-mix(in oklab, var(--brand-soft) 22%, transparent);
  }
  &:active::before,
  &[data-pressed]::before {
    opacity: 1;
    transition-duration: 80ms;
  }
  @media (prefers-reduced-motion: reduce) {
    &::before {
      transition: none;
    }
  }
}
/* Caption plate over a photo: clear glass with a dark tint and a lit top edge. Add \`refract\` to bend
   the photo at its rim (Chromium); every other browser keeps the frosted plate. */
/* @canvas Cards: Caption plate */
@utility glass-plate {
  --refract-depth: 12;
  --refract-bezel: 14;
  --refract-blur: 5;
  --refract-light: 0.9;
  background:
    linear-gradient(
      165deg,
      color-mix(in oklab, var(--brand-soft) 10%, transparent),
      rgba(10, 10, 13, 0) 45%
    ),
    rgba(10, 10, 13, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    inset 0 0 24px color-mix(in oklab, var(--brand) 6%, transparent);
  backdrop-filter: blur(18px) saturate(150%);
  @media (prefers-reduced-transparency: reduce) {
    background: #161618;
    backdrop-filter: none;
  }
}
/* Hairline rule that starts in accent. Use on the top border of rows and list items. */
/* @canvas Frames: Accent rule */
@utility rule-brand {
  border-image: var(--rule-brand) 1;
}
/* Faint accent light behind the page, so glass has something to refract. Fixed, behind content. */
/* @canvas Effects: Ambient light */
@utility ambient-light {
  &::before {
    content: '';
    position: fixed;
    inset: 0;
    z-index: -1;
    background:
      radial-gradient(
        60vw 45vw at 88% -10%,
        color-mix(in oklab, var(--brand-strong) 13%, transparent),
        transparent 70%
      ),
      radial-gradient(
        50vw 40vw at -8% 62%,
        color-mix(in oklab, var(--brand-strong) 9%, transparent),
        transparent 70%
      );
    pointer-events: none;
  }
}
/* Film grain over a video or photo. The hero video is generated and its skin reads as painted; grain
   breaks up the smooth gradients. Baking the grain into the MP4 took it from 5 MB
   to 8 MB at a light setting and 95 MB at a strong one, so the grain is an overlay: one small noise
   tile, repeated. It is static. --grain sets its strength. */
/* @canvas Effects: Film grain */
@utility film-grain {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  1.6 0 0 0 -0.3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 240px 240px;
  mix-blend-mode: overlay;
  opacity: var(--grain, 0.5);
}
/* Profile gallery layers. The chosen photo wipes in over the last one from the side its thumbnail sits
   on (--wipe-from, set by the gallery), and settles from a 6% overscale. The last photo dims under it.
   Every layer stays mounted, so a photo is already loaded when its thumbnail is picked. */
@utility photo-swap {
  position: absolute;
  inset: 0;
  opacity: 0;
  &[data-state='previous'] {
    z-index: 1;
    opacity: 1;
    animation: photo-recede 600ms var(--ease-liquid) both;
  }
  &[data-state='current'] {
    z-index: 2;
    opacity: 1;
  }
  &[data-state='current'][data-wipe] {
    animation: photo-wipe 600ms var(--ease-liquid) both;
    & img {
      animation: photo-settle 900ms var(--ease-liquid) both;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    &,
    & img {
      animation: none !important;
    }
  }
}
@keyframes photo-wipe {
  from {
    clip-path: var(--wipe-from, inset(0 0 0 100%));
  }
  to {
    clip-path: inset(0);
  }
}
@keyframes photo-settle {
  from {
    scale: 1.06;
  }
}
@keyframes photo-recede {
  to {
    filter: brightness(0.55);
  }
}
@utility page-x {
  padding-inline: clamp(1.25rem, 5vw, 5rem);
}
@utility section-y {
  padding-top: clamp(4rem, 9vw, 8.5rem);
}
/* @canvas Type: Display face */
@utility display-face {
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.05;
  text-wrap: balance;
}

/* Brand utility classes. Canvas sections use only these for type, buttons, cards, frames and surfaces,
   so a new brand restyles every section from this file. Edit the rules, keep the class names.
   See docs/canvas/section-catalogue.md, part 3. */
/* @canvas Type: Hero heading */
@utility type-hero {
  @apply display-face text-[clamp(2.6rem,12vw,4rem)] leading-[0.98] tracking-[-0.02em] md:text-[clamp(3.2rem,8vw,7.5rem)];
}
/* @canvas Type: Heading 1 */
@utility type-h1 {
  @apply display-face text-[clamp(2.4rem,6vw,4.6rem)];
}
/* @canvas Type: Heading 2 */
@utility type-h2 {
  @apply display-face text-[clamp(2rem,3.6vw,3.4rem)];
}
/* @canvas Type: Large heading 2 */
@utility type-h2-lg {
  @apply display-face text-[clamp(2.4rem,5vw,4.6rem)];
}
/* @canvas Type: Heading 3 */
@utility type-h3 {
  @apply font-display text-2xl leading-tight;
}
/* @canvas Type: Lede */
@utility type-lede {
  @apply text-[clamp(1.05rem,1.35vw,1.3rem)] leading-relaxed text-ink-soft;
}
/* @canvas Type: Body text */
@utility type-body {
  @apply leading-relaxed text-ink-soft;
}
/* @canvas Type: Small text */
@utility type-small {
  @apply text-[0.85rem] text-ink-muted;
}
/* @canvas Type: Eyebrow */
@utility eyebrow {
  @apply text-[0.72rem] font-medium tracking-[0.2em] text-brand uppercase;
}
/* @canvas Type: Price */
@utility type-price {
  @apply font-display text-brand-soft tabular-nums;
}
/* @canvas Type: Accent words */
@utility accent-text {
  @apply text-accent-gradient;
}
/* @canvas Buttons: Primary button */
@utility btn-primary {
  @apply liquid-fill liquid-press inline-flex min-h-13 items-center justify-center gap-2 rounded-full px-6 font-medium transition-transform active:scale-[0.97];
}
/* @canvas Buttons: Secondary button */
@utility btn-secondary {
  @apply liquid-clear liquid-press inline-flex min-h-13 items-center justify-center gap-2 rounded-full px-6 font-medium transition-transform active:scale-[0.97];
}
/* @canvas Buttons: Quiet link */
@utility btn-quiet {
  @apply inline-flex items-center gap-2 bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-1 text-[0.78rem] font-medium tracking-[0.2em] uppercase transition-[background-size] duration-300 hover:bg-[length:100%_1px];
}
/* @canvas Buttons: Chip */
@utility chip {
  @apply glass inline-flex min-h-9 items-center rounded-full border border-hairline px-4 text-[0.85rem];
}
/* @canvas Buttons: Chip link */
@utility chip-link {
  @apply chip liquid-sheen liquid-press;
}
/* @canvas Cards: Card */
@utility card {
  @apply glass rounded-3xl p-[clamp(1.5rem,2.4vw,2.25rem)];
}
/* @canvas Cards: Linked card */
@utility card-link {
  @apply liquid-card liquid-press;
}
/* @canvas Frames: Photo frame */
@utility media-frame {
  @apply overflow-hidden rounded-3xl border border-hairline bg-ground-2;
}
/* @canvas Frames: Rule */
@utility rule {
  @apply border-t border-hairline;
}
/* Surfaces reset the colour tokens for their subtree, so every utility inside follows. */
/* @canvas Surfaces: Dark */
@utility surface-dark {
  --color-ground: #0b0b0c;
  --color-ground-2: #111113;
  --color-ink: #f4f4f5;
  --color-ink-soft: rgba(244, 244, 245, 0.78);
  --color-ink-muted: #9d9da3;
  --color-hairline: rgba(255, 255, 255, 0.1);
  --color-hairline-strong: rgba(255, 255, 255, 0.16);
  background-color: var(--color-ground);
  color: var(--color-ink);
}
/* @canvas Surfaces: Light */
@utility surface-light {
  --color-ground: #f7f4ef;
  --color-ground-2: #ffffff;
  --color-ink: #17161a;
  --color-ink-soft: rgba(23, 22, 26, 0.78);
  --color-ink-muted: #6b6870;
  --color-hairline: rgba(0, 0, 0, 0.1);
  --color-hairline-strong: rgba(0, 0, 0, 0.18);
  background-color: var(--color-ground);
  color: var(--color-ink);
}
/* @canvas Surfaces: Brand colour */
@utility surface-brand {
  --color-ground: var(--brand);
  --color-ground-2: var(--brand-strong);
  --color-ink: var(--brand-ink);
  --color-ink-soft: color-mix(in oklab, var(--brand-ink) 82%, transparent);
  --color-ink-muted: color-mix(in oklab, var(--brand-ink) 64%, transparent);
  --color-hairline: color-mix(in oklab, var(--brand-ink) 16%, transparent);
  --color-hairline-strong: color-mix(in oklab, var(--brand-ink) 26%, transparent);
  background-color: var(--color-ground);
  color: var(--color-ink);
}
`
