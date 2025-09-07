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
    <div className="flex flex-wrap justify-around gap-5 rounded-md bg-gray-200 p-2 max-sm:gap-3 max-sm:text-sm max-md:justify-between dark:bg-gray-900">
      <div
        className={
          'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-white p-4 text-center text-gray-700 dark:bg-gray-950 dark:text-white'
        }
        title="Tous les batiments actifs et donc disponibles pour la prédication."
      >
        <span className="font-black text-6xl max-sm:font-extrabold max-sm:text-3xl">
          {stats.all.hours}
          <span className="text-2xl">h</span> / {stats.all.studies} <span className="text-2xl">études</span>
        </span>
        par les {stats.all.count} membres de l'assemblée{' '}
        {iregular > 0 && (
          <span className="text-red-500">
            (dont {iregular} irrégulier{iregular > 1 && 's'})
          </span>
        )}
      </div>
      <div
        className={
          'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-gray-700 hover:text-gray-950 dark:text-gray-400 dark:hover:text-white'
        }
        title="Tous les batiments enregistrés dans la base de données. Permet de retrouver des batiments qui ont été désactivés précédement."
      >
        <span className="font-black text-6xl max-sm:font-extrabold max-sm:text-3xl">
          - / {stats.publishers.studies} <span className="text-2xl">études</span>
        </span>
        par les {stats.publishers.count} proclamateurs
      </div>
      <div
        className={
          'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-gray-700 hover:text-gray-950 dark:text-gray-400 dark:hover:text-white'
        }
        title="Tous les batiments enregistrés dans la base de données. Permet de retrouver des batiments qui ont été désactivés précédement."
      >
        <span className="font-black text-6xl max-sm:font-extrabold max-sm:text-3xl">
          {stats.auxiliaryPionneer.hours}
          <span className="text-2xl">h</span> / {stats.auxiliaryPionneer.studies}{' '}
          <span className="text-2xl">études</span>
        </span>
        par les {stats.auxiliaryPionneer.count} pionniers auxiliaires
      </div>
      <div
        className={
          'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-gray-700 hover:text-gray-950 dark:text-gray-400 dark:hover:text-white'
        }
        title="Tous les batiments enregistrés dans la base de données. Permet de retrouver des batiments qui ont été désactivés précédement."
      >
        <span className="font-black text-6xl max-sm:font-extrabold max-sm:text-3xl">
          {stats.permanentPionneer.hours}
          <span className="text-2xl">h</span> / {stats.permanentPionneer.studies}{' '}
          <span className="text-2xl">études</span>
        </span>
        par les {stats.permanentPionneer.count} pionniers permanents
      </div>
    </div>
  )
}
