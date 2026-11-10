'use client'

// The form blocks' code (fields, validation, submit) loads only on pages that render a form.
import dynamic from 'next/dynamic'
import { lazyBlock } from 'payload-canvas/react'

export const FormBlock = lazyBlock(dynamic(() => import('./Form').then((module) => module.FormBlock)))
export const FormFieldBlock = lazyBlock(dynamic(() => import('./FormFieldBlock').then((module) => module.FormFieldBlock)))
export const FormSubmitBlock = lazyBlock(dynamic(() => import('./FormSubmitBlock').then((module) => module.FormSubmitBlock)))
