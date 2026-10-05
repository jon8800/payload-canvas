// Type tests for `fromPayloadComponents`. `pnpm typecheck` checks them: every call must compile,
// and each `@ts-expect-error` must fail. Nothing here renders. The one runtime test keeps
// `node --test` happy.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Component, ComponentType, ReactElement, ReactNode } from 'react'
import { fromPayloadComponents } from './payload'

type HeroProps = { block: { title: string }; context: { count: number } }
type HeadingProps = { text?: string }

declare const HeroComponent: (props: HeroProps) => ReactNode
declare const HeadingLeaf: ComponentType<HeadingProps>
declare const neverMap: Record<string, ComponentType<never>>
declare const typedMap: Record<string, ComponentType<HeroProps>>
declare function AsyncElement(props: HeadingProps): Promise<ReactElement>
declare function AsyncNode(props: HeroProps): Promise<ReactNode>
declare class ClassComponent extends Component<HeadingProps> {}

function typeChecks(): void {
  // Components with different props types in one map.
  fromPayloadComponents({ hero: HeroComponent, heading: HeadingLeaf }, [])
  // A map typed `Record<string, ComponentType<P>>`, as in the README.
  fromPayloadComponents(typedMap, [], { props: (block, context) => ({ block, context }) })
  // Async server components.
  fromPayloadComponents({ element: AsyncElement, node: AsyncNode }, [])
  // Class components, and the old `ComponentType<never>` map.
  fromPayloadComponents({ legacy: ClassComponent }, [])
  fromPayloadComponents(neverMap, [])

  // @ts-expect-error a string is not a component
  fromPayloadComponents({ heading: 'div' }, [])
  // @ts-expect-error an object is not a component
  fromPayloadComponents({ heading: { text: 'x' } }, [])
}
void typeChecks

test('fromPayloadComponents type tests are compiled by pnpm typecheck', () => {
  assert.equal(typeof fromPayloadComponents, 'function')
})
