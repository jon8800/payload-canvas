// @ts-nocheck -- Ported from payload-customiser plugin
'use client'
import type React from 'react'

import { useConfig } from '@payloadcms/ui'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface PopupMessage {
  searchParams: {
    [key: string]: string | undefined
    code: string
    installation_id: string
    state: string
  }
  type: string
}

export const usePopupWindow = (props: {
  eventType?: string

  onMessage?: (searchParams: PopupMessage['searchParams']) => Promise<void>
  url: string
}): {
  isPopupOpen: boolean
  openPopupWindow: () => void
  popupRef?: React.RefObject<null | Window>
} => {
  const { eventType, onMessage, url } = props
  const isReceivingMessage = useRef(false)
  const [isOpen, setIsOpen] = useState(false)
  const {
    config: { serverURL },
  } = useConfig()
  const popupRef = useRef<null | Window>(null)

  useEffect(() => {
    const receiveMessage = async (event: MessageEvent): Promise<void> => {
      if (
        event.origin !== window.location.origin ||
        event.origin !== url ||
        event.origin !== serverURL
      ) {
        return
      }

      if (
        typeof onMessage === 'function' &&
        event.data?.type === eventType &&
        !isReceivingMessage.current
      ) {
        isReceivingMessage.current = true
        await onMessage(event.data?.searchParams)
        isReceivingMessage.current = false
      }
    }

    if (isOpen && popupRef.current) {
      window.addEventListener('message', receiveMessage, false)
    }

    return () => {
      window.removeEventListener('message', receiveMessage)
    }
  }, [onMessage, eventType, url, serverURL, isOpen])

  const openPopupWindow = useCallback(
    (e?: MouseEvent) => {
      if (e) {
        e.preventDefault()
      }

      const features = {
        height: 700,
        left: 'auto',
        menubar: 'no',
        popup: 'yes',
        toolbar: 'no',
        top: 'auto',
        width: 800,
      }

      const popupOptions = Object.entries(features)
        .reduce((str, [key, value]) => {
          let strCopy = str
          if (value === 'auto') {
            if (key === 'top') {
              const v = Math.round(window.innerHeight / 2 - features.height / 2)
              strCopy += `top=${v},`
            } else if (key === 'left') {
              const v = Math.round(window.innerWidth / 2 - features.width / 2)
              strCopy += `left=${v},`
            }
            return strCopy
          }

          strCopy += `${key}=${value},`
          return strCopy
        }, '')
        .slice(0, -1)

      const newWindow = window.open(url, '_blank', popupOptions)

      popupRef.current = newWindow

      setIsOpen(true)
    },
    [url],
  )

  useEffect(() => {
    let timer: NodeJS.Timeout

    if (isOpen) {
      timer = setInterval(function () {
        if (popupRef.current.closed) {
          clearInterval(timer)
          setIsOpen(false)
        }
      }, 1000)
    } else {
      clearInterval(timer)
    }

    return () => {
      if (timer) {
        clearInterval(timer)
      }
    }
  }, [isOpen, popupRef])

  return {
    isPopupOpen: isOpen,
    openPopupWindow,
    popupRef,
  }
}
