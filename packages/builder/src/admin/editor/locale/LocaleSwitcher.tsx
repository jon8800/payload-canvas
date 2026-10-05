'use client'

// The top bar's locale switcher: which language the canvas shows and the inspector edits. Each
// locale says how many props still show the fallback language.

import { Icon } from '../icons'
import { MenuButton, type MenuEntry } from '../menu/Menu'
import { useRuntime } from '../runtime'
import { useEditor } from '../store'
import { localeName, switchLocale, untranslatedMap } from './locale'
import './locale.scss'

export function LocaleSwitcher() {
  const runtime = useRuntime()
  const settings = runtime.store.localization
  const locale = useEditor(runtime.store, (s) => s.locale)
  if (!settings || !locale || settings.locales.length < 2) return null

  const items = (): MenuEntry[] => {
    const { layout } = runtime.store.getState()
    return settings.locales.map((code) => {
      const missing = [...untranslatedMap(layout, runtime.config.blocks, settings, code).values()].reduce((sum, keys) => sum + keys.length, 0)
      const note = code === settings.defaultLocale ? ' · default' : missing > 0 ? ` · ${missing} not translated` : ''
      return {
        label: `${localeName(runtime, code)} (${code})${note}`,
        checked: code === locale,
        run: () => switchLocale(runtime, code),
      }
    })
  }
  const other = locale !== settings.defaultLocale
  return (
    <MenuButton
      className={`builder-locale-switch${other ? ' builder-locale-switch--other' : ''}`}
      triggerLabel={`Language: ${localeName(runtime, locale)}. Change the language`}
      tooltip={other ? `Editing ${localeName(runtime, locale)}. Text changes only this language; blocks and styles change every language.` : 'Language the canvas shows and you edit'}
      label="Languages"
      align="center"
      items={items}
    >
      <Icon name="globe" size={14} />
      <span className="builder-locale-switch__code">{locale.toUpperCase()}</span>
      <Icon name="chevronDown" size={12} />
    </MenuButton>
  )
}
