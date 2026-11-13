/**
 * The congregation and the document's title over a heavy rule, as its printed sheet opens, with
 * « À jour au … » at the right as on paper. In the viewer it is the page's title, said once; the
 * edit page's preview nests it under its own heading.
 */
export function BoardMasthead({
  congregationName,
  title,
  asOf,
  until,
  level = 'h2',
}: {
  congregationName: string
  title: string
  /** « À jour au 13 novembre 2026 ». */
  asOf?: string
  /** « Affiché jusqu’au … », a fact of the board rather than of the document: never printed. */
  until?: string
  level?: 'h1' | 'h2'
}) {
  const Heading = level
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-foreground border-b-[3px] pb-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-muted-foreground text-sm">{congregationName}</span>
        <Heading className="font-bold text-3xl leading-tight tracking-[-0.01em] md:text-4xl">{title}</Heading>
      </div>
      {(asOf || until) && (
        <p className="flex flex-col text-muted-foreground text-sm sm:items-end sm:text-right">
          {asOf && <span>{asOf}</span>}
          {until && <span className="print:hidden">{until}</span>}
        </p>
      )}
    </header>
  )
}
