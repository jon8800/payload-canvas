// Tests only. The default maps load the interactive blocks with `next/dynamic` (see `lazy.tsx`),
// which renders nothing outside Next. Tests that render them through RenderLayout use these.
import type { BlockComponents } from '../render/types'
import { Accordion } from './builtins/Accordion'
import { Carousel } from './builtins/Carousel'
import { FilterLink } from './builtins/FilterLink'
import { ImageViewer } from './builtins/ImageViewer'
import { Menu } from './Menu'

export const eagerComponents: BlockComponents = { menu: Menu, accordion: Accordion, carousel: Carousel, filterLink: FilterLink, imageViewer: ImageViewer }
