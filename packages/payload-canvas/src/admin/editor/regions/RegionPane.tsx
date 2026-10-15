'use client'

// The inspector for a selected page region: what it is, its fields, and the way to edit them.
// The fields are edited with Payload's own form in the settings drawer (every field type, with
// Payload's validation and access) and, for text and images, on the canvas.

import { Button } from '@payloadcms/ui'

import { regionAccessAt, regionFieldOf } from '../../../core/regions'
import { Icon } from '../icons'
import { useRuntime } from '../runtime'
import { useValue } from '../valueStore'
import type { RegionsController } from './controller'
import { editRegionFields } from './RegionOverlay'

export function RegionPane({ regions, name }: { regions: RegionsController; name: string }) {
  const runtime = useRuntime()
  const state = useValue(regions.state)
  const allProblems = useValue(runtime.problems)
  const region = regions.region(name)
  if (!region) return null
  const problems = allProblems.filter((p) => p.path && regionFieldOf([region], p.path))
  const drafts = runtime.doc.meta.get().drafts

  return (
    <div className="builder-editor__block-pane">
      <div className="builder-editor__block-head">
        <span className="builder-editor__block-icon">
          <Icon name="lock" size={16} />
        </span>
        <span className="builder-editor__block-name">
          <span className="builder-editor__block-title">{region.label}</span>
          <span className="builder-editor__block-sub">Fixed part of the page</span>
        </span>
      </div>
      {problems.length > 0 && (
        <div className="builder-editor__block-problems" role="alert">
          <Icon name="warning" size={14} />
          <div>
            <p className="builder-editor__block-problems-title">Fix this to publish</p>
            <ul>
              {problems.map((p) => (
                <li key={p.message}>{p.message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="builder-editor__fields">
        <p className="builder-editor__hint">
          It shows fields of this document, outside the layout. Double-click its text or images on the canvas to edit them. Changes save to
          the document{drafts ? ' as a draft, and go live when you publish' : ''}.
        </p>
        {state.status === 'error' && (
          <p className="builder-editor__hint" role="alert">
            {state.error}
          </p>
        )}
        {region.fields.length > 0 ? (
          <ul className="builder-region__fields">
            {region.fields.map((field) => {
              const right = state.access ? regionAccessAt(state.access, field.path) : null
              const locked = right !== null && !right.update
              return (
                <li key={field.path}>
                  <button
                    type="button"
                    className="builder-editor__menu-item"
                    onClick={() => runtime.doc.openSettings({ path: field.path, tabs: field.tabs })}
                    data-tooltip={locked ? 'You may not change this field' : 'Edit in the settings'}
                  >
                    <Icon name={locked ? 'lock' : 'rename'} size={14} />
                    {field.label}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="builder-editor__hint">It has no fields to edit.</p>
        )}
        <Button buttonStyle="secondary" size="small" margin={false} onClick={() => editRegionFields(runtime, regions, region.name)}>
          Edit fields in the settings
        </Button>
      </div>
    </div>
  )
}
