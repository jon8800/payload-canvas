'use client'
import type { BlocksFieldClient, ClientBlock, ClientField, SanitizedDocumentPermissions } from 'payload'

import {
  RenderFields,
  useDocumentInfo,
  useField,
  useForm,
  useFormInitializing,
  useFormProcessing,
  useServerFunctions,
} from '@payloadcms/ui'
import React, { useEffect, useRef, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/views/customiser/components/Tabs'
import { CUSTOMISER_BLOCKS_FIELD } from '@/utilities/customiserConfig'
import { useSelectedSection } from './context/SelectedSectionContext'
import './DocumentFields.scss'

const baseClass = 'document-fields'

type Args = {
  readonly AfterFields?: React.ReactNode
  readonly BeforeFields?: React.ReactNode
  readonly Description?: React.ReactNode
  readonly docPermissions: SanitizedDocumentPermissions
  readonly fields: ClientField[]
  readonly readOnly?: boolean
  readonly schemaPathSegments: string[]
}

type PathSegment = {
  fieldName: string
  rowIndex: number
}

function parseSelectedPath(selectedSection: string): PathSegment[] {
  const parts = selectedSection.split('.')
  const segments: PathSegment[] = []

  for (let i = 0; i < parts.length; i += 2) {
    const fieldName = parts[i]
    const rowIndex = parseInt(parts[i + 1], 10)
    if (!isNaN(rowIndex)) {
      segments.push({ fieldName, rowIndex })
    }
  }

  return segments
}

function NestedBlockFields({
  blocks,
  currentPath,
  docPermissions,
  parentSchemaPath,
  readOnly,
  segments,
  segmentIndex,
}: {
  blocks: ClientBlock[]
  currentPath: string
  docPermissions: SanitizedDocumentPermissions
  parentSchemaPath: string
  readOnly: boolean
  segments: PathSegment[]
  segmentIndex: number
}) {
  const segment = segments[segmentIndex]
  const isLastSegment = segmentIndex === segments.length - 1

  const { rows = [] } = useField<number>({
    hasRows: true,
    path: currentPath,
  })

  const selectedRow = rows?.[segment.rowIndex] as { blockType: string; id: string } | undefined
  if (!selectedRow) {
    return <div className={`${baseClass}__empty-state`}>Block not found</div>
  }

  const blockConfig = blocks.find((block) => block.slug === selectedRow.blockType)
  if (!blockConfig) {
    return <div className={`${baseClass}__empty-state`}>Block type not found</div>
  }

  const rowPath = `${currentPath}.${segment.rowIndex}`
  const schemaPath = `${parentSchemaPath}.${blockConfig.slug}`

  if (isLastSegment) {
    const fieldsWithoutNestedBlocks = blockConfig.fields.filter(
      (field) => field.type !== 'blocks',
    )

    const parentIndexPath = segments.map((s) => s.rowIndex).join('.')

    return (
      <RenderFields
        key={selectedRow.id}
        fields={fieldsWithoutNestedBlocks}
        forceRender
        parentIndexPath={parentIndexPath}
        parentPath={rowPath}
        parentSchemaPath={schemaPath}
        permissions={docPermissions?.fields}
        readOnly={readOnly}
      />
    )
  }

  const nextSegment = segments[segmentIndex + 1]
  const nestedBlocksField = blockConfig.fields.find(
    (field): field is BlocksFieldClient =>
      field.type === 'blocks' && 'name' in field && field.name === nextSegment.fieldName,
  )

  if (!nestedBlocksField) {
    return <div className={`${baseClass}__empty-state`}>Nested blocks field not found</div>
  }

  return (
    <NestedBlockFields
      blocks={nestedBlocksField.blocks}
      currentPath={`${rowPath}.${nestedBlocksField.name}`}
      docPermissions={docPermissions}
      parentSchemaPath={`${schemaPath}.${nestedBlocksField.name}`}
      readOnly={readOnly}
      segmentIndex={segmentIndex + 1}
      segments={segments}
    />
  )
}

function SelectedSectionFields({
  docPermissions,
  readOnly,
  schemaPathSegments,
  layoutField,
  selectedSection,
}: {
  docPermissions: SanitizedDocumentPermissions
  readOnly: boolean
  schemaPathSegments: string[]
  layoutField: BlocksFieldClient
  selectedSection: string
}) {
  const { getFormState } = useServerFunctions()
  const { id, collectionSlug, globalSlug, getDocPreferences } = useDocumentInfo()
  const { dispatchFields } = useForm()
  const [isInitialized, setIsInitialized] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setIsInitialized(false)

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    const initializeFormState = async () => {
      try {
        const docPreferences = await getDocPreferences()

        const { state } = await getFormState({
          id,
          collectionSlug,
          docPermissions,
          docPreferences,
          globalSlug,
          operation: id ? 'update' : 'create',
          schemaPath: (collectionSlug || globalSlug) as string,
          signal: controller.signal,
        })

        if (state && !controller.signal.aborted) {
          const selectedBlockPath = selectedSection + '.'

          for (const [fieldPath, fieldState] of Object.entries(state)) {
            if (fieldPath.startsWith(selectedBlockPath) && fieldState && typeof fieldState === 'object' && 'value' in fieldState) {
              const fieldData = fieldState as { value: unknown; initialValue?: unknown }
              dispatchFields({
                type: 'UPDATE',
                path: fieldPath,
                initialValue: fieldData.initialValue,
                value: fieldData.value,
              })
            }
          }
          setIsInitialized(true)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Error initializing form state:', error)
          setIsInitialized(true)
        }
      }
    }

    const timer = setTimeout(() => {
      initializeFormState()
    }, 50)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [selectedSection, getFormState, id, collectionSlug, globalSlug, docPermissions, getDocPreferences, dispatchFields])

  const segments = parseSelectedPath(selectedSection)

  if (segments.length === 0) {
    return <div className={`${baseClass}__empty-state`}>Invalid selection</div>
  }

  if (!isInitialized) {
    return <div className={`${baseClass}__loading`}>Loading fields...</div>
  }

  const baseSchemaPath = `${schemaPathSegments.join('.')}.${layoutField.name}`

  return (
    <NestedBlockFields
      blocks={layoutField.blocks}
      currentPath={layoutField.name}
      docPermissions={docPermissions}
      parentSchemaPath={baseSchemaPath}
      readOnly={readOnly}
      segmentIndex={0}
      segments={segments}
    />
  )
}

export function DocumentFields({
  AfterFields,
  BeforeFields,
  Description,
  docPermissions,
  fields,
  readOnly: readOnlyProp,
  schemaPathSegments,
}: Args) {
  const { selectedSection } = useSelectedSection()
  const formInitializing = useFormInitializing()
  const formProcessing = useFormProcessing()

  const readOnly = Boolean(readOnlyProp || formInitializing || formProcessing)

  const layoutField = fields.find(
    (field): field is BlocksFieldClient => 'name' in field && field.name === CUSTOMISER_BLOCKS_FIELD && field.type === 'blocks',
  )
  const otherFields = fields.filter((field) => 'name' in field && field.name !== CUSTOMISER_BLOCKS_FIELD)

  return (
    <div className={[baseClass, `${baseClass}__sidebar-wrap`].filter(Boolean).join(' ')}>
      <div className={`${baseClass}__sidebar`}>
        {Description && (
          <header className={`${baseClass}__header`}>
            <div className={`${baseClass}__sub-header`}>{Description}</div>
          </header>
        )}
        {BeforeFields}
        <div className={`${baseClass}__sidebar-fields`}>
          <Tabs defaultValue="layout" className={`${baseClass}__tabs-wrapper`}>
            <TabsList>
              <TabsTrigger value="layout">Layout</TabsTrigger>
              <TabsTrigger value="page">Page</TabsTrigger>
            </TabsList>
            <TabsContent value="layout">
              {selectedSection && layoutField ? (
                <SelectedSectionFields
                  key={selectedSection}
                  docPermissions={docPermissions}
                  readOnly={readOnly}
                  schemaPathSegments={schemaPathSegments}
                  layoutField={layoutField}
                  selectedSection={selectedSection}
                />
              ) : (
                <div className={`${baseClass}__empty-state`}>
                  Select a section to edit its fields
                </div>
              )}
            </TabsContent>
            <TabsContent value="page">
              <RenderFields
                fields={otherFields}
                forceRender
                parentIndexPath=""
                parentPath=""
                parentSchemaPath={schemaPathSegments.join('.')}
                permissions={docPermissions?.fields}
                readOnly={readOnly}
              />
            </TabsContent>
          </Tabs>
          {AfterFields}
        </div>
      </div>
    </div>
  )
}
