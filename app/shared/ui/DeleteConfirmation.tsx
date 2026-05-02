import { AlertTriangle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Form, Link } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'
import { SubmitButton } from '~/shared/ui/SubmitButton'

interface DeleteConfirmationProps {
  title: string
  submitLabel: string
  cancelTo: string
  impact?: string
  children?: React.ReactNode
}

export function DeleteConfirmation({ title, submitLabel, cancelTo, impact, children }: DeleteConfirmationProps) {
  const cancelRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  return (
    <div className="flex items-center justify-center p-7">
      <Card className="max-w-lg">
        <CardHeader className="items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-6 text-destructive" />
          </div>
          <CardTitle className="text-center">{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {children && <div className="rounded-lg border bg-muted/30 px-3 py-2 text-center text-sm">{children}</div>}
          {impact && (
            <Alert className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
              <AlertTriangle className="size-4" />
              <AlertDescription>{impact}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <div className="flex w-full justify-center gap-3">
            <Button variant="outline" asChild>
              <Link ref={cancelRef} to={cancelTo}>
                {m.common_cancel()}
              </Link>
            </Button>
            <Form method="post">
              <SubmitButton variant="destructive">{submitLabel}</SubmitButton>
            </Form>
          </div>
          <p className="text-center text-muted-foreground text-xs">{m.common_escape_to_cancel()}</p>
        </CardFooter>
      </Card>
    </div>
  )
}
