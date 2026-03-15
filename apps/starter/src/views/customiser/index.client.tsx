// @ts-nocheck -- Ported from payload-customiser plugin; Payload internal types have strict null constraints
'use client'

import type { FormProps } from '@payloadcms/ui/forms/Form'
import type {
  ClientCollectionConfig,
  ClientConfig,
  ClientField,
  ClientGlobalConfig,
  ClientUser,
  Data,
  LivePreviewConfig,
} from 'payload'

import {
  DocumentControls,
  DocumentLocked,
  DocumentTakeOver,
  Form,
  LeaveWithoutSaving,
  OperationProvider,
  SetDocumentStepNav,
  SetDocumentTitle,
  useAuth,
  useConfig,
  useDocumentDrawerContext,
  useDocumentEvents,
  useDocumentInfo,
  useNav,
  useServerFunctions,
  useTranslation,
} from '@payloadcms/ui'
import { abortAndIgnore } from '@payloadcms/ui/utilities/abortAndIgnore'
import { handleBackToDashboard } from '@payloadcms/ui/utilities/handleBackToDashboard'
import { handleGoBack } from '@payloadcms/ui/utilities/handleGoBack'
import { handleTakeOver } from '@payloadcms/ui/utilities/handleTakeOver'
import { useRouter } from 'next/navigation'
import React, { Fragment, useCallback, useEffect, useRef, useState } from 'react'

import { CUSTOMISER_BLOCKS_FIELD } from '@/utilities/customiserConfig'
import { DocumentFields } from './DocumentFields'
import { useLivePreviewContext } from './LivePreview/Context/context'
import { LivePreviewProvider } from './LivePreview/Context/index'
import { LivePreview } from './LivePreview/Preview'
import { usePopupWindow } from './LivePreview/usePopupWindow'
import './index.scss'
import { SectionFields } from './SectionFields'
import { SelectedSectionProvider, useSelectedSection } from './context/SelectedSectionContext'

const baseClass = 'customiser'

type Props = {
  readonly apiRoute: string
  readonly collectionConfig?: ClientCollectionConfig
  readonly config: ClientConfig
  readonly fields: ClientField[]
  readonly globalConfig?: ClientGlobalConfig
  readonly schemaPath: string
  readonly serverURL: string
}

const CustomiserView: React.FC<Props> = ({
  collectionConfig,
  config,
  fields,
  globalConfig,
  schemaPath,
}) => {
  const {
    id,
    action,
    AfterDocument,
    AfterFields,
    apiURL,
    BeforeFields,
    collectionSlug,
    currentEditor,
    disableActions,
    disableLeaveWithoutSaving,
    docPermissions,
    documentIsLocked,
    getDocPreferences,
    globalSlug,
    hasPublishPermission,
    hasSavePermission,
    initialData,
    initialState,
    isEditing,
    isInitializing,
    lastUpdateTime,
    setCurrentEditor,
    setDocumentIsLocked,
    unlockDocument,
    updateDocumentEditor,
  } = useDocumentInfo()

  const { getFormState } = useServerFunctions()

  const { onSave: onSaveFromProps } = useDocumentDrawerContext()

  const operation = id ? 'update' : 'create'

  const {
    config: {
      admin: { user: userSlug },
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const router = useRouter()
  const { t } = useTranslation()
  const { previewWindowType } = useLivePreviewContext()
  const { refreshCookieAsync, user } = useAuth()
  const { reportUpdate } = useDocumentEvents()
  const { setNavOpen } = useNav()
  const { setSelectedSection } = useSelectedSection()

  const docConfig = collectionConfig || globalConfig

  const lockDocumentsProp = docConfig?.lockDocuments !== undefined ? docConfig?.lockDocuments : true
  const isLockingEnabled = lockDocumentsProp !== false

  const lockDurationDefault = 300 // Default 5 minutes in seconds
  const lockDuration =
    typeof lockDocumentsProp === 'object' ? lockDocumentsProp.duration : lockDurationDefault
  const lockDurationInMilliseconds = lockDuration * 1000

  const [isReadOnlyForIncomingUser, setIsReadOnlyForIncomingUser] = useState(false)
  const [showTakeOverModal, setShowTakeOverModal] = useState(false)

  const formStateAbortControllerRef = useRef(new AbortController())

  const [editSessionStartTime, setEditSessionStartTime] = useState(Date.now())

  const lockExpiryTime = lastUpdateTime + lockDurationInMilliseconds

  const isLockExpired = Date.now() > lockExpiryTime

  const documentLockStateRef = useRef<{
    hasShownLockedModal: boolean
    isLocked: boolean
    user: ClientUser | number | string
  } | null>({
    hasShownLockedModal: false,
    isLocked: false,
    user: null,
  })

  const onSave = useCallback(
    (json) => {
      reportUpdate({
        id,
        entitySlug: collectionSlug,
        operation: id ? 'update' : 'create',
        updatedAt: json?.result?.updatedAt || new Date().toISOString(),
      })

      // If we're editing the doc of the logged-in user,
      // Refresh the cookie to get new permissions
      if (user && collectionSlug === userSlug && id === user.id) {
        void refreshCookieAsync()
      }

      // Unlock the document after save
      if ((id || globalSlug) && isLockingEnabled) {
        setDocumentIsLocked(false)
      }

      if (typeof onSaveFromProps === 'function') {
        void onSaveFromProps({
          ...json,
          operation: id ? 'update' : 'create',
        })
      }
    },
    [
      collectionSlug,
      globalSlug,
      id,
      isLockingEnabled,
      onSaveFromProps,
      refreshCookieAsync,
      reportUpdate,
      setDocumentIsLocked,
      user,
      userSlug,
    ],
  )

  const onChange: FormProps['onChange'][0] = useCallback(
    async ({ formState: prevFormState, submitted }) => {
      // FIRST: Create optimistic state immediately
      // Mark fields with values as valid to fix race condition where user types and saves quickly
      const optimisticState = { ...prevFormState }

      for (const [path, field] of Object.entries(optimisticState)) {
        if (
          field &&
          typeof field === 'object' &&
          'valid' in field &&
          !field.valid &&
          'value' in field
        ) {
          const value = field.value
          const hasValue =
            value !== undefined &&
            value !== null &&
            value !== '' &&
            !(Array.isArray(value) && value.length === 0)

          if (hasValue) {
            optimisticState[path] = {
              ...field,
              valid: true,
              errorMessage: undefined,
            }
          }
        }
      }

      // Abort any pending getFormState request
      abortAndIgnore(formStateAbortControllerRef.current)

      const controller = new AbortController()
      formStateAbortControllerRef.current = controller

      const currentTime = Date.now()
      const timeSinceLastUpdate = currentTime - editSessionStartTime

      const updateLastEdited = isLockingEnabled && timeSinceLastUpdate >= 10000 // 10 seconds

      if (updateLastEdited) {
        setEditSessionStartTime(currentTime)
      }

      const docPreferences = await getDocPreferences()

      try {
        const { lockedState, state } = await getFormState({
          id,
          collectionSlug,
          docPermissions,
          docPreferences,
          formState: optimisticState, // Use optimistic state as base
          globalSlug,
          operation,
          returnLockStatus: isLockingEnabled ? true : false,
          schemaPath,
          signal: controller.signal,
          skipValidation: !submitted, // Skip validation until form is submitted (matches Payload pattern)
          updateLastEdited,
        })

        setDocumentIsLocked(true)

        if (isLockingEnabled) {
          const previousOwnerID =
            typeof documentLockStateRef.current?.user === 'object'
              ? documentLockStateRef.current?.user?.id
              : documentLockStateRef.current?.user

          if (lockedState) {
            const lockedUserID =
              typeof lockedState.user === 'string' || typeof lockedState.user === 'number'
                ? lockedState.user
                : lockedState.user.id

            if (!documentLockStateRef.current || lockedUserID !== previousOwnerID) {
              if (previousOwnerID === user.id && lockedUserID !== user.id) {
                setShowTakeOverModal(true)
                documentLockStateRef.current.hasShownLockedModal = true
              }

              documentLockStateRef.current = documentLockStateRef.current = {
                hasShownLockedModal: documentLockStateRef.current?.hasShownLockedModal || false,
                isLocked: true,
                user: lockedState.user as ClientUser,
              }

              setCurrentEditor(lockedState.user as ClientUser)
            }
          }
        }

        return state
      } catch (error) {
        // If the request was aborted, return the optimistic state
        if (controller.signal.aborted) {
          return optimisticState
        }
        // Re-throw other errors
        throw error
      }
    },
    [
      editSessionStartTime,
      isLockingEnabled,
      getDocPreferences,
      getFormState,
      id,
      collectionSlug,
      docPermissions,
      globalSlug,
      operation,
      schemaPath,
      setDocumentIsLocked,
      user?.id,
      setCurrentEditor,
    ],
  )

  // Clean up when the component unmounts or when the document is unlocked
  useEffect(() => {
    return () => {
      if (!isLockingEnabled) {
        return
      }

      const currentPath = window.location.pathname

      const documentID = id || globalSlug

      // Routes where we do NOT want to unlock the document
      const stayWithinDocumentPaths = ['preview', 'api', 'versions']

      const isStayingWithinDocument = stayWithinDocumentPaths.some((path) =>
        currentPath.includes(path),
      )

      // Unlock the document only if we're actually navigating away from the document
      if (documentID && documentIsLocked && !isStayingWithinDocument) {
        // Check if this user is still the current editor
        if (
          typeof documentLockStateRef.current?.user === 'object'
            ? documentLockStateRef.current?.user?.id === user?.id
            : documentLockStateRef.current?.user === user?.id
        ) {
          void unlockDocument(id, collectionSlug ?? globalSlug)
          setDocumentIsLocked(false)
          setCurrentEditor(null)
        }
      }

      setShowTakeOverModal(false)
    }
  }, [
    collectionSlug,
    globalSlug,
    id,
    unlockDocument,
    user,
    setCurrentEditor,
    isLockingEnabled,
    documentIsLocked,
    setDocumentIsLocked,
  ])

  // Cleanup effect to abort pending requests on unmount
  useEffect(() => {
    return () => {
      abortAndIgnore(formStateAbortControllerRef.current)
    }
  }, [])

  // Close the nav when the component mounts
  useEffect(() => {
    setNavOpen(false)
  }, [])

  // Listen for block selection messages from the preview iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'customiser-block-selected' && event.data.blockPath) {
        setSelectedSection(event.data.blockPath)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [setSelectedSection])

  const shouldShowDocumentLockedModal =
    documentIsLocked &&
    currentEditor &&
    (typeof currentEditor === 'object'
      ? currentEditor.id !== user?.id
      : currentEditor !== user?.id) &&
    !isReadOnlyForIncomingUser &&
    !showTakeOverModal &&
    !documentLockStateRef.current?.hasShownLockedModal &&
    !isLockExpired

  const layoutField = fields.find((field) => 'name' in field && field.name === CUSTOMISER_BLOCKS_FIELD)
  const hasLayoutFields = !!layoutField

  return (
    <OperationProvider operation={operation}>
      <Form
        action={action}
        className={`${baseClass}__form`}
        disabled={isReadOnlyForIncomingUser || !hasSavePermission}
        disableValidationOnSubmit
        initialState={initialState}
        isInitializing={isInitializing}
        method={id ? 'PATCH' : 'POST'}
        onChange={[onChange]}
        onSuccess={onSave}
      >
        {isLockingEnabled && shouldShowDocumentLockedModal && !isReadOnlyForIncomingUser && (
          <DocumentLocked
            handleGoBack={() => handleGoBack({ adminRoute, collectionSlug, router })}
            isActive={shouldShowDocumentLockedModal}
            onReadOnly={() => {
              setIsReadOnlyForIncomingUser(true)
              setShowTakeOverModal(false)
            }}
            onTakeOver={() =>
              handleTakeOver({
                id,
                collectionSlug,
                globalSlug,
                user,
                isWithinDoc: false,
                updateDocumentEditor,
                setCurrentEditor,
                documentLockStateRef,
                isLockingEnabled,
              })
            }
            updatedAt={lastUpdateTime}
            user={currentEditor}
          />
        )}
        {isLockingEnabled && showTakeOverModal && (
          <DocumentTakeOver
            handleBackToDashboard={() => handleBackToDashboard({ adminRoute, router })}
            isActive={showTakeOverModal}
            onReadOnly={() => {
              setIsReadOnlyForIncomingUser(true)
              setShowTakeOverModal(false)
            }}
          />
        )}
        {((collectionConfig &&
          !(collectionConfig.versions?.drafts && collectionConfig.versions?.drafts?.autosave)) ||
          (globalConfig &&
            !(globalConfig.versions?.drafts && globalConfig.versions?.drafts?.autosave))) &&
          !disableLeaveWithoutSaving &&
          !isReadOnlyForIncomingUser && <LeaveWithoutSaving />}
        <SetDocumentStepNav
          collectionSlug={collectionSlug}
          globalLabel={globalConfig?.label}
          globalSlug={globalSlug}
          id={id}
          pluralLabel={collectionConfig ? collectionConfig?.labels?.plural : undefined}
          useAsTitle={collectionConfig ? collectionConfig?.admin?.useAsTitle : undefined}
          view="Customiser"
        />
        <SetDocumentTitle
          collectionConfig={collectionConfig}
          config={config}
          fallback={id?.toString() || ''}
          globalConfig={globalConfig}
        />
        <DocumentControls
          apiURL={apiURL}
          data={initialData}
          disableActions={disableActions}
          hasPublishPermission={hasPublishPermission}
          hasSavePermission={hasSavePermission}
          id={id}
          isEditing={isEditing}
          onTakeOver={() =>
            handleTakeOver({
              id,
              collectionSlug,
              globalSlug,
              user,
              isWithinDoc: true,
              updateDocumentEditor,
              setCurrentEditor,
              documentLockStateRef,
              isLockingEnabled,
              setIsReadOnlyForIncomingUser,
            })
          }
          permissions={docPermissions}
          readOnlyForIncomingUser={isReadOnlyForIncomingUser}
          slug={collectionConfig?.slug || globalConfig?.slug}
          user={currentEditor}
        />
        <div
          className={[
            baseClass,
            `${baseClass}__main`,
            previewWindowType === 'popup' && `${baseClass}--detached`,
            previewWindowType === 'popup' && `${baseClass}__main--popup-open`,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {hasLayoutFields && (
            <SectionFields
              docPermissions={docPermissions}
              field={layoutField}
              readOnly={isReadOnlyForIncomingUser || !hasSavePermission}
              schemaPathSegments={[collectionSlug || globalSlug]}
            />
          )}
          <LivePreview />
          <DocumentFields
            AfterFields={AfterFields}
            BeforeFields={BeforeFields}
            docPermissions={docPermissions}
            fields={fields}
            readOnly={isReadOnlyForIncomingUser || !hasSavePermission}
            schemaPathSegments={[collectionSlug || globalSlug]}
          />
          {AfterDocument}
        </div>
      </Form>
    </OperationProvider>
  )
}

type CustomiserClientViewProps = React.FC<{
  readonly breakpoints: LivePreviewConfig['breakpoints']
  readonly initialData: Data
  readonly url: string
}>

export const CustomiserClient: CustomiserClientViewProps = (props) => {
  const { breakpoints, url } = props
  const { collectionSlug, globalSlug } = useDocumentInfo()

  const {
    config,
    config: {
      routes: { api: apiRoute },
      serverURL,
    },
    getEntityConfig,
  } = useConfig()

  const { isPopupOpen, openPopupWindow, popupRef } = usePopupWindow({
    eventType: 'payload-live-preview',
    url,
  })

  const collectionConfig = getEntityConfig({ collectionSlug })

  const globalConfig = getEntityConfig({ globalSlug })

  const schemaPath = collectionSlug || globalSlug

  return (
    <Fragment>
      <LivePreviewProvider
        breakpoints={breakpoints}
        fieldSchema={collectionConfig?.fields || globalConfig?.fields}
        isPopupOpen={isPopupOpen}
        openPopupWindow={openPopupWindow}
        popupRef={popupRef}
        url={url}
      >
        <SelectedSectionProvider>
          <CustomiserView
            apiRoute={apiRoute}
            collectionConfig={collectionConfig}
            config={config}
            fields={(collectionConfig || globalConfig)?.fields}
            globalConfig={globalConfig}
            schemaPath={schemaPath}
            serverURL={serverURL}
          />
        </SelectedSectionProvider>
      </LivePreviewProvider>
    </Fragment>
  )
}
