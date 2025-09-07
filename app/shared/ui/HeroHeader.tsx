interface HeroHeaderProps {
  title: string
  subtitle: string
  actions?: React.ReactNode
}
export function HeroHeader({ actions, title, subtitle }: HeroHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
      <div>
        <h1 className="my-3 font-bold text-4xl max-sm:text-2xl">{title}</h1>
        <p className="text-gray-500 max-sm:text-sm">{subtitle}</p>
      </div>
      <div className="flex gap-2">{actions}</div>
    </div>
  )
}
