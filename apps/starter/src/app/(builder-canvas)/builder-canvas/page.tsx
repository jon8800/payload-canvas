import { builderCanvas } from './actions'
import { CanvasClient } from './CanvasClient'

/**
 * A server page that imports the canvas server action itself. Next then registers the client
 * components the action's output uses (in server-rendered blocks and the page frame) in this
 * route's client manifest. A client page that imports the action leaves them out, and the browser
 * reports "Could not find the module … in the React Client Manifest".
 */
export default function BuilderCanvasPage() {
  return <CanvasClient server={builderCanvas} />
}
