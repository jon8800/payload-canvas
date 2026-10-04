import { NotFoundContent } from '@/components/NotFoundContent'
import { getSiteInfo } from '@/utilities/generateMeta'

/**
 * The site's 404 page, inside the site frame. Next 16 renders it in the browser (the server sends
 * an empty error document with status 404); see `SITE_404_STATUS` in components/NotFoundContent.tsx.
 */
export default async function NotFound() {
  const site = await getSiteInfo()
  return (
    <>
      <title>{site.name ? `Page not found | ${site.name}` : 'Page not found'}</title>
      <NotFoundContent />
    </>
  )
}
