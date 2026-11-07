import { latestDocuments, settingNumber, type WidgetProps } from '../server'
import { WidgetCard, WidgetEmpty, WidgetList } from '../WidgetCard'

const DEFAULT_LIMIT = 6

/** The pages and posts edited last. */
export async function RecentEdits({ req, permissions, widgetData }: WidgetProps) {
  const rows = await latestDocuments(req, permissions, { limit: settingNumber(widgetData?.limit, DEFAULT_LIMIT), draftsOnly: false })
  return (
    <WidgetCard title="Recent edits">
      {rows.length ? <WidgetList rows={rows} /> : <WidgetEmpty>Nothing edited yet.</WidgetEmpty>}
    </WidgetCard>
  )
}

/** Pages and posts with changes that are not published yet. */
export async function Drafts({ req, permissions, widgetData }: WidgetProps) {
  const rows = await latestDocuments(req, permissions, { limit: settingNumber(widgetData?.limit, DEFAULT_LIMIT), draftsOnly: true })
  return (
    <WidgetCard title="Waiting to publish">
      {rows.length ? (
        <WidgetList rows={rows.map(({ badge: _badge, ...row }) => row)} />
      ) : (
        <WidgetEmpty>All changes are published.</WidgetEmpty>
      )}
    </WidgetCard>
  )
}
