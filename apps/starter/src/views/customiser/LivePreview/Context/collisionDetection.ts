// @ts-nocheck -- Ported from payload-customiser plugin
import type { CollisionDetection } from '@dnd-kit/core'

import { rectIntersection } from '@dnd-kit/core'

export const customCollisionDetection: CollisionDetection = ({
  collisionRect,
  droppableContainers,
  ...args
}) => {
  const droppableContainer = droppableContainers.find(({ id }) => id === 'live-preview-area')

  const rectIntersectionCollisions = rectIntersection({
    ...args,
    collisionRect,
    droppableContainers: [droppableContainer],
  })

  if (rectIntersectionCollisions.length === 0) {
    return rectIntersectionCollisions
  }

  const previewAreaRect = droppableContainer?.rect?.current

  const isContained =
    collisionRect.top >= previewAreaRect.top &&
    collisionRect.left >= previewAreaRect.left &&
    collisionRect.bottom <= previewAreaRect.bottom &&
    collisionRect.right <= previewAreaRect.right

  if (isContained) {
    return rectIntersectionCollisions
  }
}
