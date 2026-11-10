import { useEffect, useState } from 'react'

import { cn } from '~/shared/utils/utils'

import type { PrivacySection } from './PrivacySections'

/** The privacy policy's contents: one link per part, the part being read marked as current. */
export function Contents({ sections, current }: { sections: PrivacySection[]; current: string | null }) {
  return (
    <ol className="flex flex-col gap-0.5 text-sm">
      {sections.map(section => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            aria-current={section.id === current ? 'true' : undefined}
            className={cn(
              'flex gap-1.5 rounded-sm px-2.5 py-1.5 text-muted-foreground leading-snug transition-colors hover:bg-hover hover:text-foreground',
              'aria-[current=true]:bg-selected aria-[current=true]:font-medium aria-[current=true]:text-foreground',
            )}
          >
            <span className="text-faint tabular-nums">{section.number}</span>
            {section.title}
          </a>
        </li>
      ))}
    </ol>
  )
}

// How far below the window's top a heading counts as read: past the scroll margin a jump leaves above it, short of
// where the next part starts after a short one (« 7. Sous-traitants » is three lines).
const READ_LINE = 96

/** The section being read: the last one whose heading has passed near the top of the window. */
export function useSectionInView(sections: PrivacySection[]): string | null {
  const [current, setCurrent] = useState<string | null>(sections[0]?.id ?? null)
  const ids = sections.map(section => section.id).join(' ')

  useEffect(() => {
    const elements = ids
      .split(' ')
      .map(id => document.getElementById(id))
      .filter(element => element != null)
    const update = () => {
      const passed = elements.filter(element => element.getBoundingClientRect().top <= READ_LINE)
      setCurrent((passed.at(-1) ?? elements[0])?.id ?? null)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [ids])

  return current
}
