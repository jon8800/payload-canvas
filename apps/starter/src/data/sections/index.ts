// Ready-made sections: block trees built from the default blocks (and the custom form block).
// The seed builds the demo site from them. Later, AI tools offer them as starting points.
import { cardGrid } from './cardGrid'
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

export * from './build'
export { lexical, type RichTextInput } from './lexical'
export { cardGrid, contact, content, cta, faq, features, footer, header, hero, imageText, postList, testimonials }
export { postCard } from './posts'

export const sections = { hero, features, imageText, content, testimonials, faq, cardGrid, cta, contact, header, footer, postList }
export { postTemplate } from './postTemplate'
