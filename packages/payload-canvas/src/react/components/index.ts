import { withClientLinks, withLinkComponent } from '../render/marks'
import type { BlockComponents } from '../render/types'
import { SectionRef } from './builtins/SectionRef'
import { Button } from './Button'
import { CollectionList } from './CollectionList'
import { Container } from './Container'
import { Divider } from './Divider'
import { Field } from './Field'
import { Heading } from './Heading'
import { Image } from './Image'
import { Link } from './Link'
import { List, ListItem } from './List'
// The menu's JavaScript loads only on pages that render a menu.
import { Menu } from './lazy'
import { Quote } from './Quote'
import { RichText } from './RichText'
import { Spacer } from './Spacer'
import { Text } from './Text'
import { Video } from './Video'

export const defaultComponents: BlockComponents = {
  stack: Container,
  grid: Container,
  heading: Heading,
  text: Text,
  richText: RichText,
  image: Image,
  // They render links with RenderLayout's `linkComponent` (for example `next/link`). The menu is a
  // client component: it gets `clientLinks` and renders `next/link` itself.
  button: withLinkComponent(Button),
  link: withLinkComponent(Link),
  menu: withClientLinks(Menu),
  list: List,
  listItem: ListItem,
  quote: Quote,
  divider: Divider,
  spacer: Spacer,
  video: Video,
  field: Field,
  collectionList: CollectionList,
  // A repeat wraps its rows the same way.
  repeat: CollectionList,
  // The live saved section block: the plugin adds its definition when saved sections are on.
  sectionRef: SectionRef,
}
