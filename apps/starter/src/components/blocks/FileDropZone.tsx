'use client'

// A file field's drop zone: drag files in, or click (or press Enter on the focused field) to browse.
// The chosen files show below it, each with a remove button. The real file input sits inside the
// zone, visually hidden but focusable, so the label, keyboard and screen readers work as usual.
// The form keeps the chosen files (`files`); the input only picks them.
import { useRef, useState, type DragEvent } from 'react'
import { acceptPatterns, maxFileBytes, maxFileCount } from 'payload-canvas/forms'
import { formClasses, join } from './formClasses'

type Props = {
  id: string
  name: string
  files: File[]
  accept?: string | null
  maxSize?: number | null
  multiple?: boolean | null
  maxFiles?: number | null
  required?: boolean
  invalid?: boolean
  describedBy?: string
  /** The builder's preview: shows the zone, takes no clicks or focus. */
  preview?: boolean
  onChange?: (files: File[]) => void
}

const MB = 1024 * 1024

/** "240 KB", "1.4 MB". */
function fileSize(bytes: number): string {
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${Math.round((bytes / MB) * 10) / 10} MB`
}

/** The zone's second line: "PDF, images · up to 5 MB each · at most 3 files". */
function rulesText({ accept, maxSize, multiple, maxFiles }: Pick<Props, 'accept' | 'maxSize' | 'multiple' | 'maxFiles'>): string {
  const types = acceptPatterns(accept).map((type) => (type === 'image/*' ? 'images' : type.replace(/^\./, '').replace(/^application\//, '').toUpperCase()))
  const most = maxFileCount({ multiple, maxFiles })
  const size = `up to ${maxFileBytes({ maxSize }) / MB} MB${most > 1 ? ' each' : ''}`
  return [types.length > 0 ? types.join(', ') : null, size, most > 1 ? `at most ${most} files` : null].filter(Boolean).join(' · ')
}

export function FileDropZone({ id, name, files, accept, maxSize, multiple, maxFiles, required, invalid, describedBy, preview, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const several = maxFileCount({ multiple, maxFiles }) > 1

  function add(picked: FileList | null) {
    const list = Array.from(picked ?? [])
    if (list.length === 0) return
    // One file: a new choice replaces it. Several: new files join the list (a file chosen twice once).
    if (!several) return onChange?.(list.slice(0, 1))
    const known = new Set(files.map((file) => `${file.name}:${file.size}:${file.lastModified}`))
    onChange?.([...files, ...list.filter((file) => !known.has(`${file.name}:${file.size}:${file.lastModified}`))])
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (!preview) add(event.dataTransfer.files)
  }

  return (
    <div className={formClasses.field}>
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- the file input inside takes the keyboard; the zone adds clicks and drops for the mouse */}
      <div
        className={join(formClasses.dropZone, preview && formClasses.previewInput)}
        data-dragging={dragging || undefined}
        onClick={(event) => {
          if (event.target !== input.current) input.current?.click()
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (!preview) setDragging(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={onDrop}
      >
        <svg className={formClasses.dropIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </svg>
        <p className={formClasses.dropTitle}>
          {several ? 'Drag files here or ' : 'Drag a file here or '}
          <span className={formClasses.dropBrowse}>browse</span>
        </p>
        <p className={formClasses.hint}>{rulesText({ accept, maxSize, multiple, maxFiles })}</p>
        <input
          ref={input}
          id={id}
          name={name}
          type="file"
          className={formClasses.srOnly}
          accept={accept || undefined}
          multiple={several}
          required={required && files.length === 0}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          tabIndex={preview ? -1 : undefined}
          disabled={preview}
          onChange={(event) => {
            add(event.target.files)
            // The form keeps the files; clearing the input lets the visitor pick the same file again.
            event.target.value = ''
          }}
        />
      </div>
      {files.length > 0 ? (
        <ul className={formClasses.fileList} aria-label="Chosen files">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}`} className={formClasses.fileItem}>
              <span className={formClasses.fileName}>{file.name}</span>
              <span className={formClasses.fileSize}>{fileSize(file.size)}</span>
              <button
                type="button"
                className={formClasses.fileRemove}
                aria-label={`Remove ${file.name}`}
                onClick={() => {
                  onChange?.(files.filter((_, at) => at !== index))
                  input.current?.focus()
                }}
              >
                <svg viewBox="0 0 16 16" className={formClasses.fileRemoveIcon} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
