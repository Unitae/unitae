import { Copy } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useFetcher } from 'react-router'
import { toast } from 'sonner'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { CodeInput } from '~/shared/ui/CodeInput'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { Label } from '~/shared/ui/label'

/** What the security action answers to the two-step intents. */
export type TwoFactorResult =
  | { ok: true }
  | { ok: false; setup?: { secret: string; qrDataUrl: string }; error?: string }

const EVERY_FOUR = /(.{4})(?=.)/g

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Groups the key in fours, as authenticator apps print it, so it can be read out and typed. */
function spacedKey(secret: string): string {
  return secret.replace(EVERY_FOUR, '$1 ')
}

/**
 * Turning two-step verification on: the dialog asks for a new secret as it opens, shows it as a QR code and as a
 * key, then the first code from the app confirms it. Cancelling leaves it off.
 */
export function EnableTwoFactorDialog({ open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.account_2fa_enable_title()}</DialogTitle>
        </DialogHeader>
        <EnableSteps onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function EnableSteps({ onDone }: { onDone: () => void }) {
  const fetcher = useFetcher<TwoFactorResult>()
  useCloseOnSave(fetcher, onDone)
  const answer = fetcher.data?.ok === false ? fetcher.data : null
  const setup = answer?.setup

  // A new secret each time the dialog opens: none is armed until a code confirms it. Asked once per opening — a
  // second request (StrictMode runs effects twice) could store a secret other than the one the QR code shows.
  const asked = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: asked once, when the steps mount
  useEffect(() => {
    if (asked.current) return
    asked.current = true
    fetcher.submit({ intent: 'start' }, { method: 'post', action: '/me/security' })
  }, [])

  async function copyKey(secret: string) {
    try {
      await navigator.clipboard.writeText(secret)
      toast(m.account_2fa_key_copied())
    } catch {
      // Clipboard refused: the key stays selectable.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Step number={1}>{m.account_2fa_step_scan()}</Step>
      <div className="flex items-center gap-4 pl-8">
        {setup ? (
          <img
            src={setup.qrDataUrl}
            alt={m.account_2fa_qr_alt()}
            className="size-36 shrink-0 rounded-md border bg-white p-1.5"
          />
        ) : (
          <div className="size-36 shrink-0 animate-pulse rounded-md border bg-muted" aria-hidden="true" />
        )}
        {setup && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-faint text-xs">{m.account_2fa_key_label()}</span>
            <span className="flex items-center gap-1 rounded-md bg-sidebar py-1 pr-1 pl-2.5">
              <code className="min-w-0 flex-1 select-all break-all font-mono text-xs tracking-wider">
                {spacedKey(setup.secret)}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={m.account_2fa_copy_key()}
                onClick={() => copyKey(setup.secret)}
              >
                <Copy aria-hidden="true" />
              </Button>
            </span>
          </div>
        )}
      </div>
      <Step number={2}>{m.account_2fa_step_code()}</Step>
      <fetcher.Form method="post" action="/me/security" className="flex flex-col gap-1.5 pl-8">
        <input type="hidden" name="intent" value="confirm" />
        <input type="hidden" name="secret" value={setup?.secret ?? ''} />
        <Label htmlFor="enable-2fa-code">{m.account_2fa_code()}</Label>
        <CodeInput
          id="enable-2fa-code"
          name="code"
          disabled={setup == null}
          aria-invalid={answer?.error != null || undefined}
          aria-describedby={answer?.error ? 'enable-2fa-error' : undefined}
          onComplete={code =>
            setup &&
            fetcher.submit(
              { intent: 'confirm', secret: setup.secret, code },
              { method: 'post', action: '/me/security' },
            )
          }
        />
        {answer?.error && (
          <p id="enable-2fa-error" className="text-destructive text-sm">
            {answer.error}
          </p>
        )}
      </fetcher.Form>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {m.common_cancel()}
        </Button>
      </DialogFooter>
    </div>
  )
}

function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-3 text-sm">
      <span className="grid size-5 shrink-0 place-content-center rounded-full bg-hover font-semibold text-xs tabular-nums">
        {number}
      </span>
      <span className="pt-px">{children}</span>
    </p>
  )
}

/** Turning it off takes a current code, so that a session left open cannot switch it off. */
export function DisableTwoFactorDialog({ open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.account_2fa_disable_title()}</DialogTitle>
          <DialogDescription>{m.account_2fa_disable_body()}</DialogDescription>
        </DialogHeader>
        <DisableForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function DisableForm({ onDone }: { onDone: () => void }) {
  const fetcher = useFetcher<TwoFactorResult>()
  useCloseOnSave(fetcher, onDone)
  const error = fetcher.data?.ok === false ? fetcher.data.error : undefined

  return (
    <fetcher.Form method="post" action="/me/security" className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="disable" />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="disable-2fa-code">{m.account_2fa_code()}</Label>
        <CodeInput
          id="disable-2fa-code"
          name="code"
          autoFocus={true}
          aria-invalid={error != null || undefined}
          aria-describedby={error ? 'disable-2fa-error' : undefined}
        />
        {error && (
          <p id="disable-2fa-error" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {m.common_cancel()}
        </Button>
        <Button type="submit" variant="destructive" disabled={fetcher.state !== 'idle'}>
          {m.account_2fa_disable_confirm()}
        </Button>
      </DialogFooter>
    </fetcher.Form>
  )
}
