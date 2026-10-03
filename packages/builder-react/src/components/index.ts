import type { BlockComponents } from '../render/types'
import { Button } from './Button'
import { Container } from './Container'
import { Divider } from './Divider'
import { Heading } from './Heading'
import { Image } from './Image'
import { Link } from './Link'
import { List } from './List'
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
  list: List,
  quote: Quote,
  divider: Divider,
  spacer: Spacer,
  video: Video,
}
