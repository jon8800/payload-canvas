'use client'

// `ThemeLive` in a chunk of its own: only the canvas renders it (`<ThemeStyle live>`), but the
// root layout imports `ThemeStyle`, and a page ships every client component its modules import.
import dynamic from 'next/dynamic'

export const ThemeLive = dynamic(() => import('./ThemeLive').then((module) => module.ThemeLive))
