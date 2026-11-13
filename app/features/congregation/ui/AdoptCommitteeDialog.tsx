import { useEffect, useRef, useState } from 'react'
import { useFetcher } from 'react-router'
import type { CandidateBrings, CommitteeTakeover } from '~/features/congregation/model/organigram-page.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

// The committee takeover, from the banner: for each of the three posts, the role the congregation had made for it —
// and what that choice brings — or an empty start. Deliberately never automatic: it moves people and permissions,
// and a wrong guess must be seen first.

const EMPTY = 'empty'

function brings(candidate: CandidateBrings | undefined): string {
  if (!candidate) return m.org_adopt_empty_hint()
  const parts = [
    candidate.leader ? m.org_adopt_leader({ name: candidate.leader }) : null,
    candidate.children.length > 0 ? m.org_adopt_children({ names: candidate.children.join(', ') }) : null,
    candidate.permissionCount === 0 ? null : m.org_adopt_permissions({ count: candidate.permissionCount }),
  ]
  return parts.filter(Boolean).join(' · ')
}

/** The takeover as the action reads it: each post's key and the role it takes over (empty = start empty), in pairs. */
export function adoptionForm(posts: { key: string }[], choices: Record<string, string>): FormData {
  const form = new FormData()
  form.append('intent', 'adopt')
  for (const post of posts) {
    const chosen = choices[post.key]
    form.append('postKey', post.key)
    form.append('fromRoleId', chosen == null || chosen === EMPTY ? '' : chosen)
  }
  return form
}

export function AdoptCommitteeDialog({
  open,
  onOpenChange,
  posts,
  candidates,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  posts: CommitteeTakeover['posts']
  candidates: CandidateBrings[]
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>()
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      posts.map(post => [post.key, post.suggestedRoleId == null ? EMPTY : String(post.suggestedRoleId)]),
    ),
  )
  const result = fetcher.state === 'idle' ? fetcher.data : undefined
  const close = useRef(onOpenChange)
  close.current = onOpenChange

  useEffect(() => {
    if (result?.ok) close.current(false)
  }, [result])

  const submit = () => fetcher.submit(adoptionForm(posts, choices), { method: 'post' })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{m.org_adopt_title()}</DialogTitle>
          <DialogDescription>{m.org_adopt_body()}</DialogDescription>
        </DialogHeader>
        <ul className="divide-border flex flex-col divide-y">
          {posts.map(post => {
            const chosen = candidates.find(candidate => String(candidate.id) === choices[post.key])
            return (
              <li key={post.key} className="grid gap-2 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-start sm:gap-4">
                <span id={`adopt-${post.key}`} className="pt-2 text-sm font-medium">
                  {post.name}
                </span>
                <div className="flex flex-col gap-1.5">
                  <Select
                    value={choices[post.key]}
                    onValueChange={value => setChoices(previous => ({ ...previous, [post.key]: value }))}
                  >
                    <SelectTrigger
                      className="w-full"
                      aria-labelledby={`adopt-${post.key}`}
                      aria-describedby={`adopt-${post.key}-brings`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY}>{m.org_adopt_empty()}</SelectItem>
                      {candidates.map(candidate => (
                        <SelectItem key={candidate.id} value={String(candidate.id)}>
                          {candidate.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p id={`adopt-${post.key}-brings`} className="text-muted-foreground text-xs leading-relaxed">
                    {brings(chosen)}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
        {result && !result.ok && result.error && (
          <p role="alert" className="text-destructive text-sm">
            {result.error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {m.common_cancel()}
          </Button>
          <Button type="button" onClick={submit} disabled={fetcher.state !== 'idle'}>
            {m.org_adopt_confirm()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
