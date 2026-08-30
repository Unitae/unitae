// The page's ideas — services, rôles personnels, adjoints, and where permissions come from —
// are simple once stated, but nothing on the chart states them. A collapsed <details> costs one
// quiet line when unneeded and answers the three questions every new admin asks, without a
// tour, a modal, or JavaScript. Same pattern as the territories edit page.

const HELP = [
  {
    title: 'Services et rôles personnels',
    body:
      'Une case est soit un service — une équipe avec un responsable, des adjoints et des membres — soit un ' +
      'rôle personnel, tenu par une seule personne : en nommer une autre la remplace. Le type se choisit à la ' +
      'création, ou depuis « Modifier le rôle » dans le panneau — avec son nom et sa description.',
  },
  {
    title: 'Les adjoints',
    body:
      'Un adjoint peut être ajouté directement sur la case, ou recevoir sa propre case en dessous — une équipe ' +
      'ou un rôle personnel — quand sa tâche est distincte. Remplacer un titulaire ne touche jamais ses adjoints.',
  },
  {
    title: 'Personnes et autorisations',
    body:
      'L’organigramme nomme les responsables et les adjoints ; les membres des équipes s’ajoutent depuis l’onglet ' +
      'Groupes d’aptitude. Toutes les personnes d’une même case ont les mêmes autorisations, quelle que soit leur ' +
      'fonction. Si une équipe a besoin d’accès différents, créez-lui une case en dessous avec ses propres ' +
      'autorisations — elles se règlent dans Réglages → Autorisations, jamais depuis l’organigramme. Les listes ' +
      'des anciens et des assistants, ainsi que le comité de service, se remplissent automatiquement.',
  },
] as const

export function OrganigramHelp({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    // Open on an empty chart — the concepts have to arrive before the first service does —
    // and collapsed to one quiet line once there is a chart to read.
    <details open={defaultOpen || undefined} className="rounded-md border bg-muted/30 p-3 text-sm">
      <summary className="cursor-pointer font-medium">Comment fonctionne l’organigramme ?</summary>
      <dl className="mt-2 flex flex-col gap-3">
        {HELP.map(entry => (
          <div key={entry.title} className="flex flex-col gap-0.5">
            <dt className="font-medium text-xs">{entry.title}</dt>
            <dd className="text-muted-foreground text-xs leading-relaxed">{entry.body}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
