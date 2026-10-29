/**
 * A made-up site stylesheet in the shape real ones take: 12 static `@utility` rules, 8 with a
 * `@canvas Group: Label` comment, 3 of those right after another comment. It also has a functional
 * utility (not a site class), nested rules, `@media` inside a rule and comments inside rule bodies.
 */
export const SITE_GLOBALS_CSS = `@import 'tailwindcss';
@plugin '@tailwindcss/typography';

@custom-variant dark (&:is(.dark *));

/* Design tokens. One accent colour, a light ground and dark ink. */
@theme {
  --font-display: var(--font-display-face), system-ui, sans-serif;
  --color-ground: #fafafa;
  --color-ink: #18181b;
  --color-accent: #2563eb;
  --container-content: 80rem;
}

/* Shared surface effects. */
/* @canvas Effects: Glass */
@utility glass {
  /* Translucent fill with a blur behind it. */
  background: rgb(255 255 255 / 0.6);
  backdrop-filter: blur(12px);
  @media (prefers-reduced-transparency: reduce) {
    background: var(--color-ground);
    backdrop-filter: none;
  }
}

/* @canvas Effects: Soft shadow */
@utility soft-shadow {
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.08);
}

/* Not a label: an unlabelled helper follows. */
@utility shine {
  position: relative;
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(120deg, transparent, rgb(255 255 255 / 0.4), transparent);
  }
}

@utility page-x {
  padding-inline: 1.5rem;
}

@utility section-y {
  padding-block: 4rem;
}

/* Type styles. Sizes follow the viewport. */
/* @canvas Type: Heading 1 */
@utility type-h1 {
  font-family: var(--font-display);
  font-size: clamp(2.5rem, 6vw, 4.5rem);
  line-height: 1.05;
}

/* @canvas Type: Heading 2 */
@utility type-h2 {
  font-family: var(--font-display);
  font-size: clamp(2rem, 4vw, 3rem);
}

/* @canvas Type: Lead paragraph */
@utility type-lead {
  font-size: 1.25rem;
  color: color-mix(in oklch, var(--color-ink), transparent 25%);
}

/* Buttons share one height. */
/* @canvas Buttons: Primary button */
@utility btn-primary {
  display: inline-flex;
  min-height: 2.75rem;
  background: var(--color-accent);
  color: white;
  &:hover {
    background: color-mix(in oklch, var(--color-accent), black 12%);
  }
}

/* @canvas Buttons: Ghost button */
@utility btn-ghost {
  display: inline-flex;
  min-height: 2.75rem;
  border: 1px solid currentColor;
}

@utility card {
  border-radius: 1rem;
  padding: 1.5rem;
  background: white;
}

/* @canvas Surfaces: Dark */
@utility surface-dark {
  background: var(--color-ink);
  color: var(--color-ground);
}

/* A functional utility: no single class to offer. */
@utility tab-* {
  tab-size: --value(integer);
}
`
