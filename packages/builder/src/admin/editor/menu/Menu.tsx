'use client'

// The editor's one menu primitive, on Base UI `Menu`. Use it for every "…" menu and context menu,
// so they all behave the same:
//
// - the trigger toggles the menu;
// - a press outside closes it, also a press in the canvas iframe (the editor sends the dismiss
//   signal in `./dismiss.ts`), and so does a selection change;
// - focus leaving the menu closes it;
// - Escape closes it and returns the focus to the trigger;
// - arrow keys, Home, End and typing a letter move between items.
//
// `MenuButton` is a trigger with its menu. `ContextMenu` opens at a point (a right-click).
// Both take `items`: a function, so the entries are built only while the menu is open.

import { Menu } from '@base-ui/react/menu'
import { isValidElement, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'

import { Icon, type IconName } from '../icons'
import { onDismissMenus } from './dismiss'
import './menu.scss'

export type MenuItem = {
  label: string
  /** An editor icon name, or any icon element. */
  icon?: IconName | ReactNode
  /** Shortcut hint shown on the right, e.g. `keyText(BLOCK_KEYS.copy)` from `./keys`. */
  keys?: string
  disabled?: boolean
  /** Red: the item deletes something. */
  danger?: boolean
  /** Set (true or false) for an on/off item. It shows a check mark when true. */
  checked?: boolean
  /**
   * The action moves the focus itself (an input or a dialog). The menu then does not return the
   * focus to its trigger, which would take it away again.
   */
  ownFocus?: boolean
  /** A link item: opens `href` instead of running `run`. */
  href?: string
  newTab?: boolean
  run?: () => void
}

export type MenuEntry = MenuItem | 'separator'

type Side = 'top' | 'bottom' | 'left' | 'right'
type Align = 'start' | 'center' | 'end'

/**
 * Menus render inside the editor root, so they get its fonts and CSS variables. Read when the
 * menu opens; outside the editor (no root) Base UI falls back to `document.body`.
 */
const EDITOR_ROOT: RefObject<HTMLElement | null> = {
  get current() {
    return typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('.builder-editor')
  },
}

function ItemIcon({ icon }: { icon: MenuItem['icon'] }) {
  if (!icon) return <span className="builder-menu__icon" />
  if (typeof icon === 'string') return <Icon name={icon as IconName} size={14} />
  return isValidElement(icon) ? icon : <span className="builder-menu__icon">{icon}</span>
}

function Entry({ item, onOwnFocus }: { item: MenuItem; onOwnFocus: () => void }) {
  const className = `builder-menu__item${item.danger ? ' builder-menu__item--danger' : ''}`
  const content = (
    <>
      <ItemIcon icon={item.icon} />
      <span className="builder-menu__label">{item.label}</span>
      {item.keys && <kbd className="builder-menu__keys">{item.keys}</kbd>}
      {item.checked && <Icon name="check" size={14} className="builder-menu__check" />}
    </>
  )
  const run = () => {
    if (item.ownFocus) onOwnFocus()
    item.run?.()
  }
  if (item.href) {
    return (
      <Menu.LinkItem
        className={className}
        href={item.href}
        target={item.newTab ? '_blank' : undefined}
        rel={item.newTab ? 'noreferrer' : undefined}
        label={item.label}
        closeOnClick
      >
        {content}
      </Menu.LinkItem>
    )
  }
  if (item.checked !== undefined) {
    return (
      <Menu.CheckboxItem className={className} checked={item.checked} disabled={item.disabled} label={item.label} closeOnClick onCheckedChange={run}>
        {content}
      </Menu.CheckboxItem>
    )
  }
  return (
    <Menu.Item className={className} disabled={item.disabled} label={item.label} onClick={run}>
      {content}
    </Menu.Item>
  )
}

/** Builds the entries when the popup renders (only while open). */
function Entries({ items, onOwnFocus }: { items: () => MenuEntry[]; onOwnFocus: () => void }) {
  return items().map((entry, i) =>
    entry === 'separator' ? (
      // oxlint-disable-next-line react/no-array-index-key -- separators have no identity
      <Menu.Separator key={`sep-${i}`} className="builder-menu__sep" />
    ) : (
      <Entry key={entry.label} item={entry} onOwnFocus={onOwnFocus} />
    ),
  )
}

type PopupProps = {
  /** The menu's accessible name, e.g. "Block actions". */
  label: string
  items: () => MenuEntry[]
  /** Small print under the items (a block id, the model name). */
  footer?: ReactNode
  side?: Side
  align?: Align
  anchor?: { getBoundingClientRect: () => DOMRect } | null
}

function MenuPopup({ label, items, footer, side = 'bottom', align = 'start', anchor }: PopupProps) {
  // Set by an `ownFocus` item; read when the menu closes.
  const keepFocus = useRef(false)
  return (
    <Menu.Portal container={EDITOR_ROOT}>
      <Menu.Positioner
        className="builder-menu__positioner"
        positionMethod="fixed"
        side={side}
        align={align}
        sideOffset={4}
        collisionPadding={8}
        anchor={anchor ?? undefined}
      >
        <Menu.Popup
          className="builder-menu"
          aria-label={label}
          finalFocus={() => {
            const move = !keepFocus.current
            keepFocus.current = false
            return move
          }}
        >
          <Entries items={items} onOwnFocus={() => (keepFocus.current = true)} />
          {footer && <div className="builder-menu__note">{footer}</div>}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  )
}

/**
 * While the menu is open: closes it on the editor's dismiss signal (a canvas press, a selection
 * change) and when the focus moves to anything but a menu or the trigger. (Base UI closes on
 * focus leaving the popup, but a menu opened by a click can leave the focus on its trigger.)
 */
function useDismiss(open: boolean, close: () => void, trigger?: RefObject<HTMLElement | null>) {
  const onDismiss = useEffectEvent(close)
  useEffect(() => {
    if (!open) return
    const onFocusIn = (e: FocusEvent) => {
      if (!(e.target instanceof Element) || e.target.closest('.builder-menu') || trigger?.current?.contains(e.target)) return
      onDismiss()
    }
    const off = onDismissMenus(() => onDismiss())
    document.addEventListener('focusin', onFocusIn)
    return () => {
      off()
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [open, trigger])
}

export type MenuButtonProps = PopupProps & {
  /** Classes of the trigger button. */
  className?: string
  /** The trigger's accessible name when it shows only an icon. */
  triggerLabel?: string
  /** Tooltip of the trigger (see `tooltip/Tooltips.tsx`). Hidden while the menu is open. */
  tooltip?: string
  /** What the trigger shows, e.g. `<Icon name="more" />`. */
  children: ReactNode
  disabled?: boolean
  onOpenChange?: (open: boolean) => void
}

/** A button that opens a menu. Default placement: under the button, right edges aligned. */
export function MenuButton({
  className,
  triggerLabel,
  tooltip,
  children,
  disabled,
  onOpenChange,
  align = 'end',
  ...popup
}: MenuButtonProps) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const change = (next: boolean) => {
    setOpen(next)
    onOpenChange?.(next)
  }
  useDismiss(open, () => change(false), trigger)
  return (
    <Menu.Root open={open} onOpenChange={change} modal={false}>
      <Menu.Trigger ref={trigger} className={className} aria-label={triggerLabel} data-tooltip={tooltip} disabled={disabled}>
        {children}
      </Menu.Trigger>
      <MenuPopup align={align} {...popup} />
    </Menu.Root>
  )
}

export type Point = { x: number; y: number }

export type ContextMenuProps = Omit<PopupProps, 'anchor' | 'side'> & {
  /** Where the menu opens, in admin viewport pixels. Null closes it. */
  at: Point | null
  onClose: () => void
}

/** A menu at a point: the right-click menu. Controlled by `at`. */
export function ContextMenu({ at, onClose, ...popup }: ContextMenuProps) {
  const open = at !== null
  // The last point stays the anchor while the menu closes.
  const [last, setLast] = useState<Point>({ x: 0, y: 0 })
  if (at && (at.x !== last.x || at.y !== last.y)) setLast(at)
  const { x, y } = at ?? last
  const anchor = useMemo(() => ({ getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 }) }), [x, y])
  useDismiss(open, onClose)
  return (
    <Menu.Root open={open} onOpenChange={(next) => !next && onClose()} modal={false}>
      <MenuPopup side="bottom" align="start" anchor={anchor} {...popup} />
    </Menu.Root>
  )
}
