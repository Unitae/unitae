import { Check, MoreHorizontal, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useFetcher } from 'react-router'
import { type PartRoom, roomLabel } from '~/features/events'
import * as m from '~/i18n/paraglide/messages'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/shared/ui/alert-dialog'
import { Button } from '~/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { Input } from '~/shared/ui/input'
import { useOnSettled } from './use-on-settled'

/** A programme template's room as its panel lists it: how many parts it holds. */
export interface TemplateRoom extends PartRoom {
  partCount: number
}

type Reply = { error?: Record<string, string[] | null> }
const refusalOf = (fetcher: { state: string; data?: Reply }) =>
  fetcher.state === 'idle'
    ? Object.values(fetcher.data?.error ?? {})
        .flatMap(each => each ?? [])
        .join(' ')
    : ''

/**
 * « Salles », in a programme template's panel (design « TourA-Salles-Modele »): the places where parts happen at the
 * same time, declared once. The main room stays (renamed if need be); another is added by its name, renamed, or
 * deleted after a confirmation. Which parts go where is chosen part by part (« Où »).
 */
export function TemplateRooms({ rooms }: { rooms: TemplateRoom[] }) {
  const add = useFetcher<Reply>()
  const [name, setName] = useState('')
  const inputId = useId()
  const errorId = useId()
  const input = useRef<HTMLInputElement>(null)
  useOnSettled(add, () => {
    setName('')
    input.current?.focus()
  })
  // A room deleted takes its row and its « … » button: focus goes to the name field rather than the page.
  const count = useRef(rooms.length)
  useEffect(() => {
    if (rooms.length < count.current && document.activeElement === document.body) input.current?.focus()
    count.current = rooms.length
  }, [rooms.length])
  const clean = name.trim()
  const taken = rooms.some(room => roomLabel(room) === clean)
  const message = taken ? m.settings_schedule_templates_room_taken() : refusalOf(add)
  return (
    <section className="flex flex-col gap-2" aria-labelledby={`${inputId}-title`}>
      {/* As « Parties » below it. */}
      <h3 id={`${inputId}-title`} className="flex min-h-9 items-center font-medium text-sm">
        {m.settings_schedule_templates_rooms_title()}
      </h3>
      <div className="flex flex-col rounded-md border border-border">
        {rooms.map(room => (
          <RoomRow key={room.id} room={room} others={rooms.filter(each => each.id !== room.id)} />
        ))}
        <add.Form
          method="post"
          // While a name is typed, Escape clears it rather than closing the panel (the sheet reads this mark).
          data-own-escape={name !== '' ? '' : undefined}
          onKeyDown={event => {
            if (event.key !== 'Escape' || name === '') return
            event.preventDefault()
            event.stopPropagation()
            setName('')
          }}
          className="flex flex-col gap-1 px-2 py-1.5"
          onSubmit={event => {
            if (clean === '' || taken) event.preventDefault()
          }}
        >
          <div className="flex items-center gap-1.5">
            <input type="hidden" name="intent" value="add-room" />
            <label htmlFor={inputId} className="sr-only">
              {m.settings_schedule_templates_room_name()}
            </label>
            <Input
              ref={input}
              id={inputId}
              name="name"
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder={m.settings_schedule_templates_room_name()}
              maxLength={80}
              aria-invalid={message !== '' || undefined}
              aria-describedby={message !== '' ? errorId : undefined}
              className="h-8 flex-1"
            />
            <Button type="submit" variant="outline" size="sm" disabled={add.state !== 'idle' || clean === '' || taken}>
              {m.settings_schedule_templates_room_add()}
            </Button>
          </div>
          {message !== '' && (
            <p id={errorId} role="alert" className="px-1 text-danger-text text-xs">
              {message}
            </p>
          )}
        </add.Form>
      </div>
      <p className="text-faint text-xs">{m.settings_schedule_templates_rooms_hint()}</p>
    </section>
  )
}

function RoomRow({ room, others }: { room: TemplateRoom; others: TemplateRoom[] }) {
  const rename = useFetcher<Reply>()
  const remove = useFetcher<Reply>()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [value, setValue] = useState(roomLabel(room))
  const inputId = useId()
  const errorId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const close = () => {
    setEditing(false)
    requestAnimationFrame(() => trigger.current?.focus())
  }
  useOnSettled(rename, close)
  const label = roomLabel(room)
  const next = value.trim()
  const clash = next !== label && others.some(each => roomLabel(each) === next)
  const message = clash ? m.settings_schedule_templates_room_taken() : refusalOf(rename) || refusalOf(remove)

  if (editing) {
    return (
      <rename.Form
        method="post"
        data-own-escape=""
        className="flex flex-col gap-1 border-border border-b px-2 py-1.5"
        onKeyDown={event => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          close()
        }}
        onSubmit={event => {
          if (next === label) {
            event.preventDefault()
            close()
          } else if (next === '' || clash) event.preventDefault()
        }}
      >
        <div className="flex items-center gap-1.5">
          <input type="hidden" name="intent" value="rename-room" />
          <input type="hidden" name="roomId" value={room.id} />
          <label htmlFor={inputId} className="sr-only">
            {m.settings_schedule_templates_room_name()}
          </label>
          {/* biome-ignore lint/a11y/noAutofocus: the rename the person just asked for */}
          <Input
            id={inputId}
            name="name"
            value={value}
            onChange={event => setValue(event.target.value)}
            maxLength={80}
            autoFocus
            required
            aria-invalid={message !== '' || undefined}
            aria-describedby={message !== '' ? errorId : undefined}
            className="h-8 flex-1"
          />
          <Button type="button" variant="ghost" size="icon-sm" aria-label={m.common_cancel()} onClick={close}>
            <X aria-hidden="true" />
          </Button>
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            aria-label={m.settings_schedule_templates_rename()}
            disabled={rename.state !== 'idle' || next === '' || clash}
          >
            <Check aria-hidden="true" />
          </Button>
        </div>
        {message !== '' && (
          <p id={errorId} role="alert" className="px-1 text-danger-text text-xs">
            {message}
          </p>
        )}
      </rename.Form>
    )
  }

  return (
    <div className="flex flex-col border-border border-b">
      <div className="flex min-h-11 items-center gap-2 py-1 pr-1.5 pl-3 text-sm">
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="truncate">{label}</span>
          <span className="flex-none text-faint text-xs">
            {room.isMain
              ? m.settings_schedule_templates_room_whole()
              : m.settings_schedule_templates_room_parts({ count: room.partCount })}
          </span>
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={trigger}
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={m.settings_schedule_templates_room_actions({ name: label })}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setValue(label)
                setEditing(true)
              }}
            >
              {m.settings_schedule_templates_rename()}
            </DropdownMenuItem>
            {!room.isMain && (
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                {m.settings_schedule_templates_room_delete()}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {message !== '' && (
        <p role="alert" className="px-3 pb-1.5 text-danger-text text-xs">
          {message}
        </p>
      )}
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.settings_schedule_templates_room_delete_title({ name: label })}</AlertDialogTitle>
            <AlertDialogDescription>{m.settings_schedule_templates_room_delete_body()}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => remove.submit({ intent: 'delete-room', roomId: String(room.id) }, { method: 'post' })}
            >
              {m.settings_schedule_templates_room_delete_confirm()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
