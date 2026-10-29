/** The congregation and the document's title over a heavy rule, as its printed sheet opens. */
export function BoardMasthead({ congregationName, title }: { congregationName: string; title: string }) {
  return (
    <header className="border-foreground flex flex-col gap-0.5 border-b-[3px] pb-2">
      <span className="text-muted-foreground text-sm">{congregationName}</span>
      <h2 className="text-3xl leading-tight font-bold tracking-[-0.01em] md:text-4xl">{title}</h2>
    </header>
  )
}
