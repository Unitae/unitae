import { Link } from 'react-router'
import { cn } from '~/shared/utils/utils'

export interface TerritoryLinkProps {
  territory: { id: number; number: string }
  className?: string
}

export function TerritoryLink({ territory, className }: TerritoryLinkProps) {
  return (
    <Link
      to={`/territories/territory/${territory.id}/view`}
      className={cn(
        'text-primary underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none',
        className,
      )}
    >
      {territory.number}
    </Link>
  )
}
