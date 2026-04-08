interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export function PageHeader({ actions, title, subtitle }: PageHeaderProps) {
  return (
    <div className="mb-6 flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
      <div>
        <h1 className="mb-1 font-display font-semibold text-2xl tracking-tight max-sm:text-xl">{title}</h1>
        {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}
