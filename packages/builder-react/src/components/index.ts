import type { BlockComponents } from '../render/types'
import { Button } from './Button'
import { CollectionList } from './CollectionList'
import { Container } from './Container'
import { Divider } from './Divider'
import { Field } from './Field'
import { Heading } from './Heading'
import { Image } from './Image'
import { Link } from './Link'
import { List } from './List'
import { Menu } from './Menu'
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
  button: Button,
  link: Link,
  menu: Menu,
  list: List,
  quote: Quote,
  divider: Divider,
  spacer: Spacer,
  video: Video,
  field: Field,
  collectionList: CollectionList,
}
