'use client'

// The form block's code (fields, validation, submit) loads only on pages that render a form.
import dynamic from 'next/dynamic'
import { lazyBlock } from 'payload-canvas/react'

export const FormBlock = lazyBlock(dynamic(() => import('./Form').then((module) => module.FormBlock)))
