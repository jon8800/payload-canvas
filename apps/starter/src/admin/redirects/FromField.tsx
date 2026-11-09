'use client'

import { TextField, useDocumentInfo, useField, useFormInitializing } from '@payloadcms/ui'
import { useSearchParams } from 'next/navigation'
import type { TextFieldClientProps } from 'payload'
import { useEffect, useRef } from 'react'

import { FROM_PARAM } from '@/lib/redirects'

/**
 * The redirect's "From" field. A new redirect opened with `?from=/old-path` (the dashboard's
 * "Create redirect") starts with that path filled in.
 */
export function FromField(props: TextFieldClientProps) {
  const { id } = useDocumentInfo()
  const initializing = useFormInitializing()
  const { value, setValue } = useField<string>({ path: props.path ?? props.field.name })
  const from = useSearchParams().get(FROM_PARAM)
  const filled = useRef(false)

  useEffect(() => {
    // Only once the form has its first state: an earlier value would be replaced by it.
    if (filled.current || initializing || id || !from || value) return
    filled.current = true
    setValue(from)
  }, [initializing, id, from, value, setValue])

  return <TextField {...props} />
}
