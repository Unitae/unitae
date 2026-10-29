import type { BoardLayout } from '~/features/display-board/model/board-appearance'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'

// A thumbnail of each layout, drawn in the current text colour: the page, its masthead rule, and
// where the names go. Enough to tell the layouts apart at a glance, not a preview.

const PORTRAIT = { width: 42, height: 58 }
const LANDSCAPE = { width: 58, height: 42 }

function Lines({ x, y, width, count }: { x: number; y: number; width: number; count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => y + index * 3).map(top => (
        <rect key={top} x={x} y={top} width={width} height={1.2} rx={0.6} opacity={0.45} />
      ))}
    </>
  )
}

function Page({ landscape = false, children }: { landscape?: boolean; children: React.ReactNode }) {
  const { width, height } = landscape ? LANDSCAPE : PORTRAIT
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-auto" fill="currentColor" aria-hidden="true">
      <rect
        x={0.5}
        y={0.5}
        width={width - 1}
        height={height - 1}
        rx={2}
        fill="none"
        stroke="currentColor"
        opacity={0.3}
      />
      <rect x={4} y={4} width={width * 0.45} height={2.5} rx={1} />
      <rect x={4} y={8.5} width={width - 8} height={0.8} />
      {children}
    </svg>
  )
}

const SCHEMATICS: Record<
  Exclude<BoardLayout, 'columns'> | 'groups-columns' | 'pioneers-columns',
  () => React.ReactNode
> = {
  directory: () => (
    <Page>
      {[4, 22].map(x => (
        <g key={x}>
          <rect x={x} y={12} width={10} height={1.8} rx={0.6} />
          <Lines x={x} y={16} width={7} count={4} />
          <Lines x={x + 8.5} y={16} width={7} count={4} />
          <rect x={x} y={30} width={16} height={0.6} />
          <rect x={x} y={33} width={10} height={1.8} rx={0.6} />
          <Lines x={x} y={37} width={7} count={4} />
          <Lines x={x + 8.5} y={37} width={7} count={4} />
        </g>
      ))}
    </Page>
  ),
  'groups-columns': () => (
    <Page landscape>
      {[4, 13, 22, 31, 40, 49].map(x => (
        <g key={x}>
          <rect x={x} y={12} width={6} height={1.6} rx={0.6} />
          <Lines x={x} y={16} width={6} count={7} />
        </g>
      ))}
    </Page>
  ),
  bands: () => (
    <Page>
      {[12, 27, 42].map(y => (
        <g key={y}>
          <rect x={4} y={y} width={8} height={1.8} rx={0.6} />
          <Lines x={4} y={y + 4} width={6} count={2} />
          <Lines x={15} y={y} width={7} count={4} />
          <Lines x={23.5} y={y} width={7} count={4} />
          <Lines x={32} y={y} width={6} count={4} />
          <rect x={4} y={y + 13} width={34} height={0.6} />
        </g>
      ))}
    </Page>
  ),
  leader: () => (
    <Page>
      <Lines x={4} y={13} width={15} count={3} />
      <Lines x={23} y={13} width={15} count={3} />
      {[24, 36].map(y => (
        <g key={y}>
          <rect x={4} y={y} width={14} height={1.8} rx={0.6} />
          <Lines x={4} y={y + 4} width={10} count={2} />
          <Lines x={18} y={y + 4} width={20} count={2} />
        </g>
      ))}
    </Page>
  ),
  chart: () => (
    <Page>
      <Lines x={4} y={13} width={15} count={3} />
      <Lines x={23} y={13} width={15} count={3} />
      {[4, 17, 30].map(x => (
        <g key={x}>
          <rect x={x} y={24} width={8} height={1.8} rx={0.6} />
          <rect x={x} y={28} width={9} height={0.6} />
          <Lines x={x} y={31} width={8} count={6} />
        </g>
      ))}
    </Page>
  ),
  sections: () => (
    <Page>
      {[12, 30].map(y => (
        <g key={y}>
          <rect x={4} y={y} width={14} height={1.8} rx={0.6} />
          <Lines x={4} y={y + 4} width={9} count={4} />
          <Lines x={16.5} y={y + 4} width={9} count={4} />
          <Lines x={29} y={y + 4} width={9} count={4} />
        </g>
      ))}
    </Page>
  ),
  'pioneers-columns': () => (
    <Page>
      {[4, 17, 30].map(x => (
        <g key={x}>
          <rect x={x} y={13} width={9} height={1.8} rx={0.6} />
          <Lines x={x} y={18} width={8} count={10} />
        </g>
      ))}
    </Page>
  ),
  list: () => (
    <Page>
      <Lines x={4} y={13} width={34} count={12} />
    </Page>
  ),
}

export function LayoutSchematic({ type, layout }: { type: DynamicType; layout: BoardLayout }) {
  // The groups' columns are one per group on a landscape page; the pioneers', one per type.
  const key =
    layout === 'columns' ? (type === DynamicType.PublisherGroups ? 'groups-columns' : 'pioneers-columns') : layout
  const Schematic = SCHEMATICS[key]
  return <Schematic />
}
