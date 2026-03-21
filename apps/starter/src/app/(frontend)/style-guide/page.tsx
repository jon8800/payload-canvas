import { draftMode } from 'next/headers'
import { LivePreviewListener } from '@/components/LivePreviewListener'

export default async function StyleGuidePage() {
  const { isEnabled: draft } = await draftMode()

  return (
    <main className="container mx-auto py-12 px-4 max-w-4xl">
      {draft && <LivePreviewListener />}
      <h1 className="text-4xl font-bold mb-8">Style Guide</h1>

      {/* Typography Section */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4 text-muted-foreground">Typography</h2>
        <div className="space-y-3">
          <h1 className="text-5xl font-bold">Heading 1</h1>
          <h2 className="text-4xl font-bold">Heading 2</h2>
          <h3 className="text-3xl font-semibold">Heading 3</h3>
          <h4 className="text-2xl font-semibold">Heading 4</h4>
          <h5 className="text-xl font-medium">Heading 5</h5>
          <h6 className="text-lg font-medium">Heading 6</h6>
          <p className="text-base">
            Body text — The quick brown fox jumps over the lazy dog. This paragraph demonstrates the
            base font family, size, and line height configured by your theme settings.
          </p>
          <p className="text-sm text-muted-foreground">
            Small text / muted foreground — Secondary information and descriptions use this style.
          </p>
          <p className="font-mono text-sm">
            Monospace font — const theme = {`{ primary: '#0a0a0a' }`}
          </p>
        </div>
      </section>

      {/* Color Swatches Section */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4 text-muted-foreground">Colors</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <ColorSwatch name="Primary" className="bg-primary text-primary-foreground" />
          <ColorSwatch name="Secondary" className="bg-secondary text-secondary-foreground" />
          <ColorSwatch name="Accent" className="bg-accent text-accent-foreground" />
          <ColorSwatch name="Muted" className="bg-muted text-muted-foreground" />
          <ColorSwatch name="Destructive" className="bg-destructive text-white" />
          <ColorSwatch name="Background" className="bg-background text-foreground border" />
          <ColorSwatch name="Foreground" className="bg-foreground text-background" />
          <ColorSwatch name="Card" className="bg-card text-card-foreground border" />
        </div>
      </section>

      {/* Buttons Section */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4 text-muted-foreground">Buttons</h2>
        <div className="flex flex-wrap gap-3">
          <button className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">
            Primary
          </button>
          <button className="inline-flex items-center justify-center rounded-md bg-secondary text-secondary-foreground px-4 py-2 text-sm font-medium">
            Secondary
          </button>
          <button className="inline-flex items-center justify-center rounded-md bg-destructive text-white px-4 py-2 text-sm font-medium">
            Destructive
          </button>
          <button className="inline-flex items-center justify-center rounded-md border border-input bg-background text-foreground px-4 py-2 text-sm font-medium">
            Outline
          </button>
          <button className="inline-flex items-center justify-center rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium">
            Accent
          </button>
        </div>
      </section>

      {/* Form Elements Section */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4 text-muted-foreground">Form Elements</h2>
        <div className="space-y-4 max-w-md">
          <div>
            <label className="text-sm font-medium mb-1 block">Text Input</label>
            <input
              type="text"
              placeholder="Type something..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              readOnly
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Select</label>
            <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option>Option 1</option>
              <option>Option 2</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" className="size-4 rounded border-input" readOnly checked />
            <label className="text-sm">Checkbox label</label>
          </div>
        </div>
      </section>

      {/* Cards Section */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4 text-muted-foreground">Cards</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg border bg-card text-card-foreground p-6">
            <h3 className="text-lg font-semibold mb-2">Card Title</h3>
            <p className="text-sm text-muted-foreground">
              Card description text demonstrating the card background and foreground colors.
            </p>
          </div>
          <div className="rounded-lg border bg-card text-card-foreground p-6">
            <h3 className="text-lg font-semibold mb-2">Another Card</h3>
            <p className="text-sm text-muted-foreground">
              This card also uses the theme border radius and spacing values.
            </p>
          </div>
        </div>
      </section>

      {/* Border Radius Showcase */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4 text-muted-foreground">Border Radius</h2>
        <div className="flex flex-wrap gap-4">
          <div className="size-16 bg-primary rounded-sm" title="rounded-sm" />
          <div className="size-16 bg-primary rounded-md" title="rounded-md" />
          <div className="size-16 bg-primary rounded-lg" title="rounded-lg" />
          <div className="size-16 bg-primary rounded-xl" title="rounded-xl" />
          <div className="size-16 bg-primary rounded-full" title="rounded-full" />
        </div>
        <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
          <span className="w-16 text-center">sm</span>
          <span className="w-16 text-center">md</span>
          <span className="w-16 text-center">lg</span>
          <span className="w-16 text-center">xl</span>
          <span className="w-16 text-center">full</span>
        </div>
      </section>
    </main>
  )
}

function ColorSwatch({ name, className }: { name: string; className: string }) {
  return (
    <div className="text-center">
      <div
        className={`rounded-lg p-4 flex items-center justify-center text-sm font-medium ${className}`}
      >
        {name}
      </div>
    </div>
  )
}
