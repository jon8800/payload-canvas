'use client'

import { useMemo, type ComponentProps } from 'react'

import { useRuntime } from '../runtime'
import { pageConditionFields } from '../templates/visibilityRows'
import { useValue } from '../valueStore'
import type { ConditionSources } from './conditions'
import { WhereField } from './WhereField'

/**
 * A collection list's `where` in the inspector. A row's value can be a relative date, a URL
 * parameter, and in a template a field of the page's document (`$page.<path>`, read when the
 * list loads, on the site and the canvas alike).
 */
export function ListWhereField(props: Omit<ComponentProps<typeof WhereField>, 'sources'>) {
  const runtime = useRuntime()
  const template = useValue(runtime.template)
  const target = template.isTemplate ? template.target : null
  const page = target ? runtime.config.templates?.sources?.[target] : undefined
  const sources = useMemo<ConditionSources>(
    () => ({ date: true, query: true, ...(page && target ? { page: pageConditionFields(page, target) } : {}) }),
    [page, target],
  )
  return <WhereField {...props} sources={sources} />
}
