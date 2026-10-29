'use client'

import { useConfig } from '@payloadcms/ui'
import { useMemo } from 'react'

import { dataFields, type DataField } from '../../../core/fields'

/**
 * The fields of a collection that a query can filter on directly: its data fields without groups,
 * arrays and blocks fields. Empty when the collection is unknown.
 */
export function useCollectionFields(collection: string | undefined): DataField[] {
  const { config } = useConfig()
  return useMemo(() => {
    const found = config.collections.find((c) => c.slug === collection)
    return found ? dataFields(found.fields as unknown[]).filter((f) => f.type !== 'group' && f.type !== 'array' && f.type !== 'blocks') : []
  }, [config.collections, collection])
}
