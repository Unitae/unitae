import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { cn } from '~/shared/utils/utils'

/**
 * A password field with « Afficher », so that whoever types it can check it. Any `type` handed in is replaced: the
 * button decides whether the characters show.
 */
export function PasswordInput({ className, ...props }: React.ComponentProps<'input'>) {
  const [shown, setShown] = useState(false)
  const Icon = shown ? EyeOff : Eye
  return (
    <div className="relative">
      <Input {...props} type={shown ? 'text' : 'password'} className={cn('pr-10', className)} />
      <button
        type="button"
        onClick={() => setShown(value => !value)}
        aria-label={m.form_password_show()}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 grid w-10 place-content-center pointer-coarse:w-11 rounded-r-md text-faint transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon aria-hidden="true" className="size-4" />
      </button>
    </div>
  )
}
