import React, { createContext, useContext, useState } from 'react'

type SelectedSectionContextType = {
  selectedSection: string | null
  setSelectedSection: (section: string | null) => void
}

const SelectedSectionContext = createContext<SelectedSectionContextType | undefined>(undefined)

export const SelectedSectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedSection, setSelectedSection] = useState<string | null>(null)

  return (
    <SelectedSectionContext.Provider value={{ selectedSection, setSelectedSection }}>
      {children}
    </SelectedSectionContext.Provider>
  )
}

export const useSelectedSection = () => {
  const context = useContext(SelectedSectionContext)
  if (context === undefined) {
    throw new Error('useSelectedSection must be used within a SelectedSectionProvider')
  }
  return context
}
