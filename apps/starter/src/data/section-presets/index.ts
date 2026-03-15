export type SectionPreset = {
  name: string
  description: string
  blocks: Record<string, unknown>[]
}

export { heroPreset } from './hero'
export { contentPreset } from './content'
export { ctaBannerPreset } from './cta-banner'
export { collectionGridPreset } from './collection-grid'
export { featuresPreset } from './features'
export { testimonialsPreset } from './testimonials'
export { faqPreset } from './faq'
export { footerCtaPreset } from './footer-cta'

import { heroPreset } from './hero'
import { contentPreset } from './content'
import { ctaBannerPreset } from './cta-banner'
import { collectionGridPreset } from './collection-grid'
import { featuresPreset } from './features'
import { testimonialsPreset } from './testimonials'
import { faqPreset } from './faq'
import { footerCtaPreset } from './footer-cta'

export const sectionPresets: SectionPreset[] = [
  heroPreset,
  contentPreset,
  ctaBannerPreset,
  collectionGridPreset,
  featuresPreset,
  testimonialsPreset,
  faqPreset,
  footerCtaPreset,
]
