import type { BlockComponents } from '../render/types'
import { Container } from './Container'
import { Heading } from './Heading'
import { Image } from './Image'
import { Text } from './Text'

export const defaultComponents: BlockComponents = {
  stack: Container,
  grid: Container,
  heading: Heading,
  text: Text,
  image: Image,
}
