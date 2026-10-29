// The site's icon set for the `icon` block: one component per name in `iconNames.ts`.
import { ArrowRight, Check, Mail, MapPin, Phone, Quote, Sparkles, Star } from 'lucide-react'
import type { IconMap } from 'payload-canvas/react'
import type { IconName } from './iconNames'

export const icons = {
  'arrow-right': ArrowRight,
  check: Check,
  mail: Mail,
  phone: Phone,
  'map-pin': MapPin,
  star: Star,
  sparkles: Sparkles,
  quote: Quote,
} satisfies IconMap<IconName>
