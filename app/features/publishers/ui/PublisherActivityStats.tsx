import { Card, CardContent } from '~/shared/ui/card'

export default function PublisherActivityStats({
  stats,
}: {
  stats: {
    all: {
      count: number
      active: number
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
  const iregular = stats.all.count - stats.all.active

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-1 p-4 text-center">
          <span className="font-black text-4xl tracking-tight">
            {stats.all.hours}
            <span className="text-lg text-muted-foreground">h</span> / {stats.all.studies}{' '}
            <span className="text-lg text-muted-foreground">études</span>
          </span>
          <span className="text-muted-foreground text-xs">
            par les {stats.all.count} membres de l'assemblée{' '}
            {iregular > 0 && (
              <span className="text-destructive">
                (dont {iregular} irrégulier{iregular > 1 && 's'})
              </span>
            )}
          </span>
        </CardContent>
      </Card>
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-1 p-4 text-center">
          <span className="font-black text-4xl text-muted-foreground tracking-tight">
            - / {stats.publishers.studies} <span className="text-lg">études</span>
          </span>
          <span className="text-muted-foreground text-xs">par les {stats.publishers.count} proclamateurs</span>
        </CardContent>
      </Card>
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-1 p-4 text-center">
          <span className="font-black text-4xl text-muted-foreground tracking-tight">
            {stats.auxiliaryPionneer.hours}
            <span className="text-lg">h</span> / {stats.auxiliaryPionneer.studies}{' '}
            <span className="text-lg">études</span>
          </span>
          <span className="text-muted-foreground text-xs">
            par les {stats.auxiliaryPionneer.count} pionniers auxiliaires
          </span>
        </CardContent>
      </Card>
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-1 p-4 text-center">
          <span className="font-black text-4xl text-muted-foreground tracking-tight">
            {stats.permanentPionneer.hours}
            <span className="text-lg">h</span> / {stats.permanentPionneer.studies}{' '}
            <span className="text-lg">études</span>
          </span>
          <span className="text-muted-foreground text-xs">
            par les {stats.permanentPionneer.count} pionniers permanents
          </span>
        </CardContent>
      </Card>
    </div>
  )
}
