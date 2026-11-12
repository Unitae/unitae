import { Callout } from '@unitae/ui'
import { Trash2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Form, Link } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'
import { SubmitButton } from '~/shared/ui/SubmitButton'

interface DeleteConfirmationProps {
  title: string
  submitLabel: string
  cancelTo: string
  impact?: string
  children?: React.ReactNode
  /** Choices posted with the deletion, inside its form: what to do with what it holds. */
  fields?: React.ReactNode
}

export function DeleteConfirmation({
  title,
  submitLabel,
  cancelTo,
  impact,
  children,
  fields,
}: DeleteConfirmationProps) {
  const cancelRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  return (
    <div className="flex items-center justify-center p-7">
      <Card className="max-w-lg">
        <CardHeader className="items-center gap-3">
          <span className="grid size-10 place-content-center rounded-md border border-border bg-sidebar">
            <Trash2 aria-hidden="true" className="size-5 text-faint" />
          </span>
          <CardTitle className="text-center">{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {children && <div className="rounded-lg border bg-muted/30 px-3 py-2 text-center text-sm">{children}</div>}
          {impact && <Callout tone="warning">{impact}</Callout>}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Form method="post" className="flex w-full flex-col gap-3">
            {fields}
            <div className="flex w-full justify-center gap-3">
              <Button variant="outline" asChild>
                <Link ref={cancelRef} to={cancelTo}>
                  {m.common_cancel()}
                </Link>
              </Button>
              <SubmitButton variant="destructive">{submitLabel}</SubmitButton>
            </div>
          </Form>
          <p className="text-center text-muted-foreground text-xs">{m.common_escape_to_cancel()}</p>
        </CardFooter>
      </Card>
    </div>
  )
}
