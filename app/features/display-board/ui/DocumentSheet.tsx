import type { BoardCard } from '~/features/display-board/server/board-home.queries'
import { cn } from '~/shared/utils/utils'

/** A line of text on the sketch, `w` its width in percent. Fixed greys: the sheet is paper, white in dark mode too. */
function Line({ w, className, color }: { w: number; className?: string; color?: string | null }) {
  return (
    <span
      className={cn('block h-[3px] shrink-0 rounded-full bg-neutral-300', className)}
      style={{ width: `${w}%`, ...(color ? { backgroundColor: color } : {}) }}
    />
  )
}

function Heading({ w }: { w: number }) {
  return <Line w={w} className="h-1 bg-neutral-500" />
}

function PdfSketch() {
  return (
    <>
      <Heading w={62} />
      <Line w={38} />
      <span className="mt-1 block h-[18%] shrink-0 rounded-sm bg-neutral-200" />
      <Line w={92} className="mt-1" />
      <Line w={86} />
      <Line w={90} />
      <Line w={54} />
    </>
  )
}

function GroupsSketch({ accent }: { accent: string | null }) {
  return (
    <>
      <Heading w={50} />
      <span className="mt-0.5 grid grid-cols-2 gap-1.5">
        {[0, 1].map(column => (
          <span key={column} className="flex flex-col gap-1 border-neutral-900 border-t-[1.5px] pt-1">
            <Line w={58} color={accent} />
            <Line w={100} />
            <Line w={80} />
            <Line w={90} />
          </span>
        ))}
      </span>
    </>
  )
}

function ListSketch({ accent }: { accent: string | null }) {
  return (
    <>
      <Heading w={45} />
      <span className="mt-0.5 flex flex-col gap-1 border-neutral-900 border-t-[1.5px] pt-1">
        <Line w={40} color={accent} />
        <Line w={70} />
        <Line w={64} />
        <Line w={46} color={accent} className="mt-0.5" />
        <Line w={72} />
      </span>
    </>
  )
}

function ProgrammeSketch() {
  return (
    <>
      <Heading w={70} />
      <Line w={40} />
      <Line w={30} className="mt-1 bg-[var(--u-section-treasures)]" />
      <Line w={90} />
      <Line w={80} />
      <Line w={30} className="mt-1 bg-[var(--u-section-ministry)]" />
      <Line w={85} />
      <Line w={30} className="mt-1 bg-[var(--u-section-living)]" />
      <Line w={75} />
    </>
  )
}

function TreeSketch({ accent }: { accent: string | null }) {
  return (
    <>
      <Heading w={50} />
      <Line w={34} color={accent} className="mt-1" />
      <Line w={70} className="ml-2.5" />
      <Line w={62} className="ml-2.5" />
      <Line w={55} className="ml-5" />
      <Line w={40} color={accent} className="mt-0.5" />
      <Line w={66} className="ml-2.5" />
    </>
  )
}

function DynamicSketch({ card }: { card: Extract<BoardCard, { kind: 'dynamic' }> }) {
  if (card.dynamicType === 'publisher-groups') return <GroupsSketch accent={card.accent} />
  if (card.dynamicType === 'programme') return <ProgrammeSketch />
  if (card.dynamicType === 'organigram') return <TreeSketch accent={card.accent} />
  return <ListSketch accent={card.accent} />
}

/**
 * A document as a sheet of paper rising from the bottom of its frame: the real first page of a PDF
 * when the board has it, otherwise a sketch of how the sheet is laid out, in its own accent. It
 * lifts a little when its card is hovered or focused.
 */
export function DocumentSheet({ card, className }: { card: BoardCard; className?: string }) {
  const thumbnail = card.kind === 'pdf' && card.hasThumbnail

  return (
    <div className={cn('flex h-full items-end justify-center overflow-hidden bg-subtle', className)}>
      <div
        aria-hidden="true"
        className={cn(
          'flex h-[86%] w-[64%] flex-col gap-[5px] overflow-hidden rounded-t-[2px] bg-white shadow-[0_0_0_1px_var(--color-border)]',
          'motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:-translate-y-1.5 motion-safe:group-focus-visible:-translate-y-1.5',
          thumbnail ? 'p-0' : 'px-[9%] pt-[9%]',
        )}
      >
        {card.kind === 'pdf' ? (
          thumbnail ? (
            <img
              src={`/board/documents/${card.id}/thumbnail`}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover object-top"
            />
          ) : (
            <PdfSketch />
          )
        ) : (
          <DynamicSketch card={card} />
        )}
      </div>
    </div>
  )
}
