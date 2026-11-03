import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'icon'
type Size = 'sm' | 'md'

const BASE =
  'inline-flex items-center justify-center gap-1.5 font-medium transition-[background-color,border-color,color,box-shadow] duration-200 disabled:cursor-not-allowed disabled:opacity-50'

const VARIANTS: Record<Variant, string> = {
  primary: 'rounded-(--radius-control) bg-brand text-white shadow-sm hover:bg-brand-hover',
  secondary: 'rounded-(--radius-control) border border-line bg-surface text-ink-soft hover:border-ink-muted/40 hover:bg-surface-sunken',
  ghost: 'rounded-(--radius-control) text-brand-ink hover:bg-brand-soft',
  icon: 'rounded-(--radius-control) border border-line bg-surface text-ink-soft hover:bg-surface-sunken',
}

const SIZES: Record<Variant, Record<Size, string>> = {
  primary: { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm' },
  secondary: { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm' },
  ghost: { sm: 'h-7 px-2 text-xs', md: 'h-9 px-3 text-sm' },
  icon: { sm: 'h-8 w-8', md: 'h-9 w-9' },
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export default function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={`${BASE} ${VARIANTS[variant]} ${SIZES[variant][size]} ${className}`} {...rest} />
}
