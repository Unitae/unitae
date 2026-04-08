interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export function PageHeader({ actions, title, subtitle }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
      <div>
        <h1 className="my-3 font-bold font-display text-3xl tracking-tight max-sm:text-2xl">{title}</h1>
        {subtitle && <p className="text-muted-foreground max-sm:text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}
