import {
  Brush,
  ClipboardList,
  FileText,
  FileX,
  FolderTree,
  Image,
  Inbox,
  KeyRound,
  LayoutTemplate,
  type LucideIcon,
  MessageSquare,
  Newspaper,
  Palette,
  PanelsTopLeft,
  Rows3,
  Search,
  Settings,
  Signpost,
  Sparkles,
  Tag,
  Users,
  // @feature:workflows
  ListChecks,
  Workflow,
  // @end:workflows
  // @feature:reviews
  Star,
  StarHalf,
  // @end:reviews
} from 'lucide-react'

/**
 * The sidebar groups, in order. Each item is a collection or global slug.
 * Collections and globals that are not listed keep the group from their own `admin.group`
 * (or "Other") and appear after these groups. Add your own slugs here.
 */
export const NAV_GROUPS: Array<{ label: string; slugs: string[] }> = [
  { label: 'Site', slugs: ['pages', 'posts', 'template-parts', 'builder-templates', 'builder-sections', 'redirects', 'not-found-log'] },
  {
    label: 'Content',
    slugs: [
      'media',
      'categories',
      'tags',
      'forms',
      'form-submissions',
      // @feature:reviews
      'reviews',
      // @end:reviews
      'builder-comments',
    ],
  },
  { label: 'Design', slugs: ['theme-settings', 'builder-classes'] },
  // @feature:workflows
  // payload-workflows: the visual workflows and the job runs they create.
  { label: 'Automation', slugs: ['workflows', 'payload-jobs'] },
  // @end:workflows
  {
    label: 'Settings',
    slugs: [
      'site-settings',
      // @feature:reviews
      'review-settings',
      // @end:reviews
      'users',
      'builder-ai-settings',
      'payload-mcp-api-keys',
      'search',
    ],
  },
]

/** An icon for each slug. Slugs without one get `FALLBACK_ICON`. */
export const NAV_ICONS: Record<string, LucideIcon> = {
  pages: FileText,
  posts: Newspaper,
  'template-parts': PanelsTopLeft,
  'builder-templates': LayoutTemplate,
  'builder-sections': Rows3,
  redirects: Signpost,
  'not-found-log': FileX,
  media: Image,
  categories: FolderTree,
  tags: Tag,
  forms: ClipboardList,
  'form-submissions': Inbox,
  'builder-comments': MessageSquare,
  'theme-settings': Palette,
  'builder-classes': Brush,
  'site-settings': Settings,
  users: Users,
  'builder-ai-settings': Sparkles,
  'payload-mcp-api-keys': KeyRound,
  search: Search,
  // @feature:workflows
  workflows: Workflow,
  'payload-jobs': ListChecks,
  // @end:workflows
  // @feature:reviews
  reviews: Star,
  'review-settings': StarHalf,
  // @end:reviews
}

export const FALLBACK_ICON: LucideIcon = FileText
