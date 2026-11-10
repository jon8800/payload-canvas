'use client'

// A form dropdown: the project's shadcn Select (Base UI), drawn like the form's inputs. Base UI
// renders a hidden input with the field's name, so the value is part of the form and `required`
// works without JavaScript too. The trigger has the field's id: its label points at it, and an
// error moves the focus to it.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formClasses, join } from './formClasses'

type Props = {
  id: string
  name: string
  value: string
  options: ReadonlyArray<{ label: string; value: string }>
  placeholder?: string
  required?: boolean
  invalid?: boolean
  describedBy?: string
  /** The builder's preview: shows the select, takes no clicks or focus. */
  preview?: boolean
  /** The input classes (the form's or the field's), else the default look. */
  className?: string
  onChange?: (value: string) => void
}

export function FormSelect({ id, name, value, options, placeholder, required, invalid, describedBy, preview, className, onChange }: Props) {
  // A value no option has (an old default) shows as empty.
  const current = options.some((option) => option.value === value) ? value : null
  return (
    <Select
      name={name}
      required={required}
      value={current}
      items={options}
      readOnly={preview}
      onValueChange={(next) => onChange?.(typeof next === 'string' ? next : '')}
    >
      <SelectTrigger
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        tabIndex={preview ? -1 : undefined}
        className={join(className ?? formClasses.input, formClasses.selectTrigger, preview && formClasses.previewInput)}
      >
        <SelectValue placeholder={placeholder || 'Choose one'} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className={formClasses.selectPopup}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className={formClasses.selectItem}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
