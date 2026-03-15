'use client'
import React, { createContext, useContext, useState } from 'react'
import './index.scss'

const baseClass = 'customiser-tabs'

type TabsContextType = {
  activeTab: string
  setActiveTab: (value: string) => void
}

const TabsContext = createContext<TabsContextType | undefined>(undefined)

function useTabsContext() {
  const context = useContext(TabsContext)
  if (!context) {
    throw new Error('Tabs components must be used within a Tabs provider')
  }
  return context
}

type TabsProps = {
  defaultValue: string
  children: React.ReactNode
  className?: string
}

export function Tabs({ defaultValue, children, className }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultValue)

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={[baseClass, className].filter(Boolean).join(' ')}>{children}</div>
    </TabsContext.Provider>
  )
}

type TabsListProps = {
  children: React.ReactNode
  className?: string
}

export function TabsList({ children, className }: TabsListProps) {
  return (
    <div className={[`${baseClass}__list`, className].filter(Boolean).join(' ')}>{children}</div>
  )
}

type TabsTriggerProps = {
  value: string
  children: React.ReactNode
  className?: string
}

export function TabsTrigger({ value, children, className }: TabsTriggerProps) {
  const { activeTab, setActiveTab } = useTabsContext()
  const isActive = activeTab === value

  return (
    <button
      type="button"
      className={[`${baseClass}__trigger`, isActive && `${baseClass}__trigger--active`, className]
        .filter(Boolean)
        .join(' ')}
      onClick={() => setActiveTab(value)}
      data-state={isActive ? 'active' : 'inactive'}
    >
      {children}
    </button>
  )
}

type TabsContentProps = {
  value: string
  children: React.ReactNode
  className?: string
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const { activeTab } = useTabsContext()

  if (activeTab !== value) return null

  return (
    <div className={[`${baseClass}__content`, className].filter(Boolean).join(' ')}>{children}</div>
  )
}
