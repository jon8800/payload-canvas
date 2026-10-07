// Ready-made sections for the editor library and AI tools, built from the section factories.
// Media and form IDs do not exist in a fresh database, so `withoutMedia` strips them and the
// canvas shows placeholders. The Image block's `image` and the Form block's `form` are optional
// props, so every section publishes as inserted: the site shows nothing for an empty image or
// form until an editor picks one. Links use plain URLs so they never point to a missing document.
import type { Block, SectionDefinition } from 'payload-canvas'
import { cardGrid } from './cardGrid'
import { url } from './build'
import { contact } from './contact'
import { content } from './content'
import { cta } from './cta'
import { faq } from './faq'
import { features } from './features'
import { footer } from './footer'
import { header } from './header'
import { hero } from './hero'
import { imageText } from './imageText'
import { postList } from './posts'
import { testimonials } from './testimonials'
import { work } from './work'

/** Dummy ID for factories that need a media or form ID. `withoutMedia` removes it. */
const NO_ID = 0

/** Returns a copy of the tree without image values (kept `alt`) and without form values. */
function withoutMedia(block: Block): Block {
  const { props, slots, ...rest } = block
  const result: Block = { ...rest }
  if (props) {
    const nextProps = { ...props }
    if (block.type === 'image') delete nextProps.image
    if (block.type === 'form') delete nextProps.form
    result.props = nextProps
  }
  if (slots) {
    result.slots = Object.fromEntries(Object.entries(slots).map(([name, children]) => [name, children.map(withoutMedia)]))
  }
  return result
}

const toContact = { label: 'Get in touch', link: url('/contact') }
const toAbout = { label: 'Learn more', link: url('/about') }
const toServices = { label: 'Our services', link: url('/services') }

const nav = [
  { label: 'About', link: url('/about') },
  { label: 'Services', link: url('/services') },
  { label: 'Blog', link: url('/blog') },
  { label: 'Contact', link: url('/contact') },
]

export const sectionLibrary: SectionDefinition[] = [
  {
    id: 'hero-two-buttons',
    label: 'Hero, two buttons',
    description: 'A large title and intro text with a main button and a second button.',
    category: 'Heroes',
    blocks: [
      hero.create({
        title: 'Software that keeps your team in sync',
        text: 'Northwind brings planning, files and chat into one calm workspace, so work moves forward without extra meetings.',
        primary: { label: 'Start free trial', link: url('/contact') },
        secondary: toServices,
        variant: 'home',
      }),
    ],
  },
  {
    id: 'hero-one-button',
    label: 'Hero, one button',
    description: 'A large title and intro text with one clear button.',
    category: 'Heroes',
    blocks: [
      hero.create({
        title: 'Run your business with less busywork',
        text: 'Northwind automates the small tasks, so you can spend your day on customers.',
        primary: toContact,
        variant: 'home',
      }),
    ],
  },
  {
    id: 'hero-title-only',
    label: 'Page header',
    description: 'An inner page title with one line of text beside it, above a thin line.',
    category: 'Heroes',
    blocks: [hero.create({ title: 'About Northwind', text: 'A small team that builds tools people enjoy using.' })],
  },
  {
    id: 'work-four',
    label: 'Selected work',
    description: 'Four projects in two staggered columns, each with an image, a name and one line about the work.',
    category: 'Features',
    blocks: [
      withoutMedia(
        work.create({
          title: 'Selected work',
          intro: 'A few recent projects.',
          items: [
            { title: 'Project one', meta: 'Website design and build', image: { id: NO_ID, alt: 'Home page of project one' } },
            { title: 'Project two', meta: 'Design system', image: { id: NO_ID, alt: 'Home page of project two' } },
            { title: 'Project three', meta: 'Online shop', image: { id: NO_ID, alt: 'Home page of project three' } },
            { title: 'Project four', meta: 'Booking site', image: { id: NO_ID, alt: 'Home page of project four' } },
          ],
        }),
      ),
    ],
  },
  {
    id: 'features-three',
    label: 'Three features',
    description: 'A title and intro beside a list of three short points.',
    category: 'Features',
    blocks: [
      features.create({
        title: 'Everything you need to get started',
        intro: 'Simple tools that work well together.',
        items: [
          { title: 'Fast setup', text: 'Create your account and invite your team in under five minutes.' },
          { title: 'Clear reports', text: 'See what is on track and what needs attention at a glance.' },
          { title: 'Friendly support', text: 'Real people answer every question within one working day.' },
        ],
      }),
    ],
  },
  {
    id: 'card-grid-three',
    label: 'Card grid',
    description: 'Three cards, each with an image, a title and a short text.',
    category: 'Features',
    blocks: [
      withoutMedia(
        cardGrid.create({
          title: 'What we offer',
          intro: 'Pick one service or combine them.',
          cards: [
            { title: 'Strategy', text: 'We study your goals and plan the next steps.', image: { id: NO_ID, alt: 'Team planning on a whiteboard' } },
            { title: 'Design', text: 'We turn the plan into clear, simple screens.', image: { id: NO_ID, alt: 'Designer sketching a layout' } },
            { title: 'Delivery', text: 'We build, test and launch with you.', image: { id: NO_ID, alt: 'Team celebrating a launch' } },
          ],
        }),
      ),
    ],
  },
  {
    id: 'image-text-left',
    label: 'Image left',
    description: 'An image on the left with a title, text and a button on the right.',
    category: 'Features',
    blocks: [
      withoutMedia(
        imageText.create({
          title: 'Built by a small, careful team',
          paragraphs: [
            'We started Northwind to make everyday work simpler.',
            'Today, more than 2,000 teams use it every day.',
          ],
          image: { id: NO_ID, alt: 'The Northwind team at work' },
          action: toAbout,
          parallax: true,
        }),
      ),
    ],
  },
  {
    id: 'image-text-right',
    label: 'Image right',
    description: 'A title, text and a button on the left with an image on the right.',
    category: 'Features',
    blocks: [
      withoutMedia(
        imageText.create({
          title: 'Made to fit the way you work',
          paragraphs: [
            'Change the layout, the colors and the steps to match your team.',
            'No code and no waiting for a developer.',
          ],
          image: { id: NO_ID, alt: 'A dashboard on a laptop screen' },
          action: toServices,
          imageRight: true,
        }),
      ),
    ],
  },
  {
    id: 'content-article',
    label: 'Text section',
    description: 'A narrow column of long text with a title, headings and a list.',
    category: 'Content',
    blocks: [
      content.create({
        title: 'How we work',
        body: [
          'Every project starts with a short call. We agree on goals, timing and budget.',
          { h3: 'Our process' },
          { ul: ['Discovery call', 'Plan and design', 'Build and test', 'Launch and support'] },
          'After launch, your team owns the result. We stay close for any changes you need.',
        ],
      }),
    ],
  },
  {
    id: 'faq-three',
    label: 'FAQ',
    description: 'Common questions with short answers, separated by lines.',
    category: 'Content',
    blocks: [
      faq.create({
        title: 'Frequently asked questions',
        items: [
          { question: 'How long does setup take?', answer: 'Most teams are ready to work in one afternoon.' },
          { question: 'Can I cancel at any time?', answer: 'Yes. You can cancel in your account settings, with no extra fee.' },
          { question: 'Do you offer help with moving my data?', answer: 'Yes. Our team imports your data for free on every paid plan.' },
        ],
      }),
    ],
  },
  {
    id: 'testimonials-two',
    label: 'Two quotes',
    description: 'Two customer quotes side by side.',
    category: 'Social proof',
    blocks: [
      testimonials.create({
        title: 'Loved by growing teams',
        items: [
          { quote: 'We cut our weekly meetings in half and finish projects sooner.', cite: 'Maria Lopez, Head of Operations' },
          { quote: 'Setup was easy, and support answered in minutes.', cite: 'Tom Becker, Founder' },
        ],
      }),
    ],
  },
  {
    id: 'testimonials-three',
    label: 'Three quotes',
    description: 'Three customer quotes in a grid.',
    category: 'Social proof',
    blocks: [
      testimonials.create({
        title: 'What our customers say',
        items: [
          { quote: 'Northwind replaced three tools for us. Our team loves it.', cite: 'Maria Lopez, Head of Operations' },
          { quote: 'Reports that used to take a day now take ten minutes.', cite: 'Tom Becker, Founder' },
          { quote: 'The best support experience we have had with any software.', cite: 'Aisha Khan, Office Manager' },
        ],
      }),
    ],
  },
  {
    id: 'cta-two-buttons',
    label: 'CTA, two buttons',
    description: 'A bold banner with a title, short text and two buttons.',
    category: 'Calls to action',
    blocks: [
      cta.create({
        title: 'Ready to get started?',
        text: 'Try Northwind free for 14 days. No credit card needed.',
        primary: { label: 'Start free trial', link: url('/contact') },
        secondary: { label: 'Talk to sales', link: url('/contact') },
      }),
    ],
  },
  {
    id: 'cta-one-button',
    label: 'CTA, one button',
    description: 'A bold banner with a title, short text and one button.',
    category: 'Calls to action',
    blocks: [
      cta.create({
        title: 'Have a project in mind?',
        text: 'Send us a short message. We reply within one working day.',
        primary: toContact,
      }),
    ],
  },
  {
    id: 'contact-form',
    label: 'Contact form',
    description: 'Contact details on the left and a form on the right.',
    category: 'Contact',
    blocks: [
      withoutMedia(
        contact.create({
          title: 'Get in touch',
          text: 'Fill in the form, or reach us directly.',
          formId: NO_ID,
          details: [
            { label: 'Email', value: 'hello@northwind.example', href: 'mailto:hello@northwind.example' },
            { label: 'Phone', value: '+1 555 0100', href: 'tel:+15550100' },
            { label: 'Hours', value: 'Mon to Fri, 9:00 to 17:00' },
          ],
        }),
      ),
    ],
  },
  {
    id: 'latest-posts',
    label: 'Latest posts',
    description: 'A title above a grid of the three latest blog posts. The cards fill in from the posts.',
    category: 'Dynamic',
    blocks: [postList.create({ title: 'Latest posts', intro: 'News and notes from the team.' })],
  },
  {
    id: 'header-simple',
    label: 'Header',
    description: 'The site name, a menu (a "Menu" button on phones) and a button.',
    category: 'Navigation',
    blocks: [header.create({ siteName: 'Northwind', home: url('/'), nav, cta: { label: 'Get in touch', link: url('/contact') } })],
  },
  {
    id: 'footer-simple',
    label: 'Footer',
    description: 'The site name, a short tagline, a column of links, contact details and a copyright line.',
    category: 'Navigation',
    blocks: [
      footer.create({
        siteName: 'Northwind',
        tagline: 'Simple tools for busy teams.',
        links: [{ label: 'Home', link: url('/') }, ...nav],
        contact: { email: 'hello@northwind.example', phone: '+1 555 0100' },
        copyright: '© 2026 Northwind. All rights reserved.',
      }),
    ],
  },
]
