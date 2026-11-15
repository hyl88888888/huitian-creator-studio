import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { LoaderCircle } from 'lucide-react'

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  loading?: boolean
}): ReactNode {
  return (
    <button
      className={`button button--${variant} button--${size} ${className}`}
      {...props}
      disabled={loading || props.disabled}
    >
      {loading ? <LoaderCircle size={17} className="spin" /> : icon}
      <span>{children}</span>
    </button>
  )
}

export function Field({
  label,
  hint,
  required,
  children,
  className = ''
}: {
  label: string
  hint?: string
  required?: boolean
  children: ReactNode
  className?: string
}): ReactNode {
  return (
    <label className={`field ${className}`}>
      <span className="field__label">
        {label}
        {required && <em>必填</em>}
      </span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>): ReactNode {
  return <input {...props} className={`input ${props.className ?? ''}`} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>): ReactNode {
  return <textarea {...props} className={`textarea ${props.className ?? ''}`} />
}

export function Select({
  value,
  onChange,
  options,
  className = ''
}: {
  value: string | number
  onChange: (value: string) => void
  options: Array<{ value: string | number; label: string }>
  className?: string
}): ReactNode {
  return (
    <select className={`select ${className}`} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option value={option.value} key={option.value}>{option.label}</option>
      ))}
    </select>
  )
}

export function Card({
  children,
  className = '',
  interactive = false
}: {
  children: ReactNode
  className?: string
  interactive?: boolean
}): ReactNode {
  return <section className={`card ${interactive ? 'card--interactive' : ''} ${className}`}>{children}</section>
}

export function Tag({
  children,
  tone = 'neutral'
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'teal'
}): ReactNode {
  return <span className={`tag tag--${tone}`}>{children}</span>
}

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}): ReactNode {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}

export function ScoreRing({ score, label }: { score: number; label: string }): ReactNode {
  const safeScore = Math.max(0, Math.min(100, Math.round(score)))
  return (
    <div className="score-ring" style={{ '--score': `${safeScore * 3.6}deg` } as React.CSSProperties}>
      <div className="score-ring__inner">
        <strong>{safeScore}</strong>
        <span>{label}</span>
      </div>
    </div>
  )
}

