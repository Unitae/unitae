import { CheckCircle2, Circle, FileText, MapPin, Users, X } from 'lucide-react'
import { Link } from 'react-router'

import * as m from '~/paraglide/messages'
import { usePersistedState } from '~/shared/hooks/use-persisted-state'
import { Button } from '~/shared/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'

interface OnboardingChecklistProps {
  publisherCount: number
  territoryCount: number
  documentCount: number
}

export function OnboardingChecklist({ publisherCount, territoryCount, documentCount }: OnboardingChecklistProps) {
  const [dismissed, setDismissed] = usePersistedState('unitae:onboarding-dismissed', false)

  if (dismissed) return null

  const allDone = publisherCount > 0 && territoryCount > 0 && documentCount > 0
  if (allDone) return null

  const steps = [
    {
      done: publisherCount > 0,
      label: m.onboarding_add_publishers(),
      icon: Users,
      to: '/settings/users',
    },
    {
      done: territoryCount > 0,
      label: m.onboarding_add_territories(),
      icon: MapPin,
      to: '/territories',
    },
    {
      done: documentCount > 0,
      label: m.onboarding_upload_document(),
      icon: FileText,
      to: '/board/documents/new',
    },
  ]

  return (
    <Card className="animate-fade-in-up border-primary/20 bg-primary/5">
      <CardHeader>
        <div>
          <CardTitle className="text-base">{m.onboarding_title()}</CardTitle>
          <p className="mt-0.5 text-muted-foreground text-sm">{m.onboarding_description()}</p>
        </div>
        <CardAction>
          <Button variant="ghost" size="icon-xs" onClick={() => setDismissed(true)}>
            <X className="size-3.5" />
            <span className="sr-only">{m.onboarding_dismiss()}</span>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {steps.map(step => (
            <Link
              key={step.to}
              to={step.to}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-primary/10"
            >
              {step.done ? (
                <CheckCircle2 className="size-4 shrink-0 text-green-600 dark:text-green-400" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" />
              )}
              <step.icon className="size-4 shrink-0 text-muted-foreground" />
              <span className={`text-sm ${step.done ? 'text-muted-foreground line-through' : 'font-medium'}`}>
                {step.label}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
