import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent } from '~/shared/ui/card'

export default function PublisherActivityStats({
  stats,
}: {
  stats: {
    all: {
      count: number
      active: number
      irregular: number
      hours: number
      studies: number
    }
    publishers: {
      count: number
      hours: number
      studies: number
    }
    permanentPionneer: {
      count: number
      hours: number
      studies: number
    }
    auxiliaryPionneer: {
      count: number
      hours: number
      studies: number
    }
  }
}) {
  const iregular = stats.all.irregular

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-1 p-4 text-center">
          <span className="font-black text-4xl tracking-tight">
            {stats.all.hours}
            <span className="text-lg text-muted-foreground">h</span> / {stats.all.studies}{' '}
            <span className="text-lg text-muted-foreground">{m.activity_stats_studies()}</span>
          </span>
          <span className="text-muted-foreground text-xs">
            {m.activity_stats_all_members({ count: String(stats.all.count) })}{' '}
            {iregular > 0 && (
              <span className="text-destructive">
                (
                {iregular > 1
                  ? m.activity_stats_irregular_plural({ count: String(iregular) })
                  : m.activity_stats_irregular({ count: String(iregular) })}
                )
              </span>
            )}
          </span>
        </CardContent>
      </Card>
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-1 p-4 text-center">
          <span className="font-black text-4xl text-muted-foreground tracking-tight">
            - / {stats.publishers.studies} <span className="text-lg">{m.activity_stats_studies()}</span>
          </span>
          <span className="text-muted-foreground text-xs">
            {m.activity_stats_publishers({ count: String(stats.publishers.count) })}
          </span>
        </CardContent>
      </Card>
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-1 p-4 text-center">
          <span className="font-black text-4xl text-muted-foreground tracking-tight">
            {stats.auxiliaryPionneer.hours}
            <span className="text-lg">h</span> / {stats.auxiliaryPionneer.studies}{' '}
            <span className="text-lg">{m.activity_stats_studies()}</span>
          </span>
          <span className="text-muted-foreground text-xs">
            {m.activity_stats_auxiliary_pioneers({ count: String(stats.auxiliaryPionneer.count) })}
          </span>
        </CardContent>
      </Card>
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-1 p-4 text-center">
          <span className="font-black text-4xl text-muted-foreground tracking-tight">
            {stats.permanentPionneer.hours}
            <span className="text-lg">h</span> / {stats.permanentPionneer.studies}{' '}
            <span className="text-lg">{m.activity_stats_studies()}</span>
          </span>
          <span className="text-muted-foreground text-xs">
            {m.activity_stats_permanent_pioneers({ count: String(stats.permanentPionneer.count) })}
          </span>
        </CardContent>
      </Card>
    </div>
  )
}
