// @ts-nocheck -- Ported from payload-customiser plugin
'use client'
import type { RenderFields } from '@payloadcms/ui'
import type { useDraggableSortable } from '@payloadcms/ui/elements/DraggableSortable/useDraggableSortable'
import type { BlocksFieldClientComponent, Field } from 'payload'

import { getTranslation } from '@payloadcms/translations'
import {
  Banner,
  BlocksDrawer,
  Button,
  DrawerToggler,
  ErrorPill,
  fieldBaseClass,
  FieldDescription,
  FieldError,
  FieldLabel,
  NullifyLocaleField,
  Pill,
  RenderCustomComponent,
  SectionTitle,
  useConfig,
  useDocumentInfo,
  useDrawerSlug,
  useField,
  useForm,
  useFormSubmitted,
  useLocale,
  useTranslation,
  withCondition,
} from '@payloadcms/ui'
import { DraggableSortable } from '@payloadcms/ui/elements/DraggableSortable'
import { DraggableSortableItem } from '@payloadcms/ui/elements/DraggableSortable/DraggableSortableItem'
import { useThrottledValue } from '@payloadcms/ui/hooks/useThrottledValue'
import { scrollToID } from '@payloadcms/ui/utilities/scrollToID'
import React, { Fragment, useCallback } from 'react'

import {
  extractRowsAndCollapsedIDs,
  toggleAllRows,
} from '../components/BlocksTreeView/rowHelpers'
import { SectionRowButton } from './SectionRowButton'

const baseClass = 'blocks-field'
type UseDraggableSortableReturn = ReturnType<typeof useDraggableSortable>
type RenderFieldsProps = Parameters<typeof RenderFields>[0]

const RowItem: React.FC<{
  blockConfig: any
  errorPaths: string[]
  hasSubmitted: boolean
  index: number
  isSortable: boolean
  Label?: React.ReactNode
  path: string
  readOnly: boolean
  row: any
}> = ({ blockConfig, errorPaths, hasSubmitted, index, isSortable, Label, path, readOnly, row }) => {
  const { i18n } = useTranslation()
  const isBlockLoading = useThrottledValue(row.isLoading, 500)
  const rowPath = `${path}.${index}`
  const rowErrorCount = errorPaths.filter((errorPath) => errorPath.startsWith(rowPath + '.')).length
  const fieldHasErrors = hasSubmitted && rowErrorCount > 0

  const nestedBlocksFields =
    blockConfig.fields?.filter((field: Field) => field.type === 'blocks') || []

  return (
    <DraggableSortableItem disabled={readOnly || !isSortable} id={row.id} key={row.id}>
      {(draggableSortableItemProps) => {
        const classNames = [
          `${baseClass}__row`,
          fieldHasErrors ? `${baseClass}__row--has-errors` : `${baseClass}__row--no-errors`,
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <div
            id={`${path?.split('.').join('-')}-row-${index}`}
            key={`${path}-row-${index}`}
            ref={draggableSortableItemProps.setNodeRef}
          >
            <SectionRowButton
              className={classNames}
              dragHandleProps={{ ...draggableSortableItemProps, id: row.id }}
              header={
                Label || (
                  <div className={`${baseClass}__block-header`}>
                    <Pill
                      className={`${baseClass}__block-pill ${baseClass}__block-pill-${row.blockType}`}
                      pillStyle="white"
                    >
                      {getTranslation(blockConfig.labels.singular, i18n)}
                    </Pill>
                    {fieldHasErrors && <ErrorPill count={rowErrorCount} i18n={i18n} withMessage />}
                  </div>
                )
              }
              key={row.id}
            />
            {nestedBlocksFields.map((nestedField: any) => {
              const nestedPath = `${rowPath}.${nestedField.name}`
              return (
                <div key={nestedPath} className={`${baseClass}__nested-blocks`}>
                  <SectionBlocks
                    field={nestedField}
                    path={nestedPath}
                    permissions={true}
                    schemaPath={nestedPath}
                  />
                </div>
              )
            })}
          </div>
        )
      }}
    </DraggableSortableItem>
  )
}

const SectionBlocksComponent: BlocksFieldClientComponent = (props) => {
  const { i18n, t } = useTranslation()
  const hasSubmitted = useFormSubmitted()
  const { code: locale } = useLocale()
  const {
    config: { localization },
  } = useConfig()

  const {
    field: {
      name,
      admin: { className, description, isSortable = true } = {},
      blocks,
      label,
      labels: labelsFromProps,
      localized,
      maxRows,
      minRows: minRowsProp,
      required,
    },
    path,
    permissions,
    readOnly,
    schemaPath: schemaPathFromProps,
    validate,
  } = props
  const schemaPath = schemaPathFromProps ?? name

  const minRows = (minRowsProp ?? required) ? 1 : 0

  const { setDocFieldPreferences } = useDocumentInfo()
  const { addFieldRow, dispatchFields, setModified } = useForm()
  const drawerSlug = useDrawerSlug('blocks-drawer')

  const labels = {
    plural: t('fields:blocks'),
    singular: t('fields:block'),
    ...labelsFromProps,
  }

  const editingDefaultLocale = (() => {
    if (localization && localization.fallback) {
      const defaultLocale = localization.defaultLocale || 'en'
      return locale === defaultLocale
    }

    return true
  })()

  const memoizedValidate = useCallback(
    (value, options) => {
      if (!editingDefaultLocale && value === null) {
        return true
      }
      if (typeof validate === 'function') {
        return validate(value, { ...options, maxRows, minRows, required })
      }
    },
    [maxRows, minRows, required, validate, editingDefaultLocale],
  )

  const {
    customComponents: { AfterInput, BeforeInput, Description, Error, Label } = {},
    errorPaths,
    rows = [],
    showError,
    valid,
    value,
  } = useField<number>({
    hasRows: true,
    path,
    validate: memoizedValidate,
  })

  const addRow = useCallback(
    (rowIndex: number, blockType: string) => {
      addFieldRow({
        blockType,
        path,
        rowIndex,
        schemaPath,
      })

      setTimeout(() => {
        scrollToID(`${path}-row-${rowIndex + 1}`)
      }, 0)
    },
    [addFieldRow, path, schemaPath],
  )

  const duplicateRow = useCallback(
    (rowIndex: number) => {
      dispatchFields({ type: 'DUPLICATE_ROW', path, rowIndex })
      setModified(true)

      setTimeout(() => {
        scrollToID(`${path}-row-${rowIndex + 1}`)
      }, 0)
    },
    [dispatchFields, path, setModified],
  )

  const removeRow = useCallback(
    (rowIndex: number) => {
      dispatchFields({
        type: 'REMOVE_ROW',
        path,
        rowIndex,
      })

      setModified(true)
    },
    [path, dispatchFields, setModified],
  )

  const moveRow = useCallback(
    (moveFromIndex: number, moveToIndex: number) => {
      dispatchFields({ type: 'MOVE_ROW', moveFromIndex, moveToIndex, path })
      setModified(true)
    },
    [dispatchFields, path, setModified],
  )

  const toggleCollapseAll = useCallback(
    (collapsed: boolean) => {
      const { collapsedIDs, updatedRows } = toggleAllRows({
        collapsed,
        rows,
      })
      dispatchFields({ type: 'SET_ALL_ROWS_COLLAPSED', path, updatedRows })
      setDocFieldPreferences(path, { collapsed: collapsedIDs })
    },
    [dispatchFields, path, rows, setDocFieldPreferences],
  )

  const setCollapse = useCallback(
    (rowID: string, collapsed: boolean) => {
      const { collapsedIDs, updatedRows } = extractRowsAndCollapsedIDs({
        collapsed,
        rowID,
        rows,
      })
      dispatchFields({ type: 'SET_ROW_COLLAPSED', path, updatedRows })
      setDocFieldPreferences(path, { collapsed: collapsedIDs })
    },
    [dispatchFields, path, rows, setDocFieldPreferences],
  )

  const hasMaxRows = maxRows && rows.length >= maxRows

  const fieldErrorCount = errorPaths.length
  const fieldHasErrors = hasSubmitted && fieldErrorCount + (valid ? 0 : 1) > 0

  const showMinRows = rows.length < minRows || (required && rows.length === 0)
  const showRequired = readOnly && rows.length === 0

  return (
    <div
      className={[
        fieldBaseClass,
        baseClass,
        className,
        fieldHasErrors ? `${baseClass}--has-error` : `${baseClass}--has-no-error`,
      ]
        .filter(Boolean)
        .join(' ')}
      id={`field-${path?.replace(/\./g, '__')}`}
    >
      {showError && (
        <RenderCustomComponent
          CustomComponent={Error}
          Fallback={<FieldError path={path} showError={showError} />}
        />
      )}

      <header className={`${baseClass}__header`}>
        <div className={`${baseClass}__header-wrap`}>
          <div className={`${baseClass}__heading-with-error`}>
            <h3>
              <RenderCustomComponent
                CustomComponent={Label}
                Fallback={
                  <FieldLabel label={label} localized={localized} path={path} required={required} />
                }
              />
            </h3>
            {fieldHasErrors && fieldErrorCount > 0 && (
              <ErrorPill count={fieldErrorCount} i18n={i18n} withMessage />
            )}
          </div>
        </div>
        <RenderCustomComponent
          CustomComponent={Description}
          Fallback={<FieldDescription description={description} path={path} />}
        />
      </header>
      {BeforeInput}
      <NullifyLocaleField fieldValue={value} localized={localized} path={path} />
      {(rows.length > 0 || (!valid && (showRequired || showMinRows))) && (
        <DraggableSortable
          className={`${baseClass}__rows`}
          ids={rows.map((row) => row.id)}
          onDragEnd={({ moveFromIndex, moveToIndex }) => moveRow(moveFromIndex, moveToIndex)}
        >
          {rows.map((row, i) => {
            const blockConfig = blocks.find((block) => block.slug === row.blockType)
            if (!blockConfig) return null
            return (
              <RowItem
                blockConfig={blockConfig}
                errorPaths={errorPaths}
                hasSubmitted={hasSubmitted}
                index={i}
                isSortable={isSortable}
                key={row.id}
                Label={Label}
                path={path}
                readOnly={readOnly}
                row={row}
              />
            )
          })}
          {!editingDefaultLocale && (
            <React.Fragment>
              {showMinRows && (
                <Banner type="error">
                  {t('validation:requiresAtLeast', {
                    count: minRows,
                    label:
                      getTranslation(minRows > 1 ? labels.plural : labels.singular, i18n) ||
                      t(minRows > 1 ? 'general:row' : 'general:rows'),
                  })}
                </Banner>
              )}
              {showRequired && (
                <Banner>
                  {t('validation:fieldHasNo', { label: getTranslation(labels.plural, i18n) })}
                </Banner>
              )}
            </React.Fragment>
          )}
        </DraggableSortable>
      )}
      {!hasMaxRows && (
        <Fragment>
          <DrawerToggler
            className={`${baseClass}__drawer-toggler`}
            disabled={readOnly}
            slug={drawerSlug}
          >
            <Button
              buttonStyle="icon-label"
              disabled={readOnly}
              el="span"
              icon="plus"
              iconPosition="left"
              iconStyle="with-border"
            >
              {t('fields:addLabel', { label: getTranslation(labels.singular, i18n) })}
            </Button>
          </DrawerToggler>
          <BlocksDrawer
            addRow={addRow}
            addRowIndex={rows?.length || 0}
            blocks={blocks}
            drawerSlug={drawerSlug}
            labels={labels}
          />
        </Fragment>
      )}
      {AfterInput}
    </div>
  )
}

export const SectionBlocks = withCondition(SectionBlocksComponent)
