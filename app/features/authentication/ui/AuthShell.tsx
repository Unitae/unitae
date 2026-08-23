import { Card } from '~/shared/ui/card'

interface AuthShellProps {
  children: React.ReactNode
}

/**
 * Shared frame of the public authentication pages (login, register, password
 * flows, 2FA, setup): a centred card on a softly brand-tinted background.
 * Children are the card's contents (CardHeader/CardContent as usual).
 */
export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,color-mix(in_oklab,var(--color-primary)_10%,transparent),transparent_70%)]"
      />
      <Card className="relative w-full max-w-md animate-fade-in-up overflow-hidden shadow-lg">
        <div className="h-1 bg-gradient-to-r from-primary to-primary/60" />
        {children}
      </Card>
    </div>
  )
}
