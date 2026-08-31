import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { Form } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/shared/ui/dialog'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

interface EnrolmentGoalDialogProps {
  enrolmentId: number
  // The stint's stored per-person goal, or null when it follows the configured type rate.
  monthlyGoal: number | null
  // Which stint is being edited ("Pionnier auxiliaire · Mai 2026"), so the dialog is unambiguous
  // when several rows carry a goal.
  description: string
}

// Corrects the frozen per-person goal on an existing enrolment via the `update-goal` intent. The
// goal is seeded from the congregation's configured rate when the stint is created and then stored
// on the row, so without this a mistaken pick is unfixable — the create form only offers the current
// and next month, which means deleting and re-creating cannot reach a past stint.
export function EnrolmentGoalDialog({ enrolmentId, monthlyGoal, description }: EnrolmentGoalDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon" title={m.publishers_enrolment_goal_edit_title()}>
          <Pencil className="size-4" />
          <span className="sr-only">{m.publishers_enrolment_goal_edit_title()}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <Form method="post" onSubmit={() => setOpen(false)}>
          <input type="hidden" name="intent" value="update-goal" />
          <input type="hidden" name="enrolmentId" value={enrolmentId} />
          <DialogHeader>
            <DialogTitle>{m.publishers_enrolment_goal_edit_title()}</DialogTitle>
            <DialogDescription>
              {description} — {m.publishers_enrolment_goal_edit_description()}
            </DialogDescription>
          </DialogHeader>
          <div className="my-4 flex flex-col gap-2">
            <Label htmlFor={`goal-${enrolmentId}`}>{m.publishers_enrolment_monthly_goal_label()}</Label>
            {/* Keyed on the stored goal so re-opening the dialog after a save shows the saved value
                rather than the defaultValue React captured on first mount. */}
            <Input
              key={String(monthlyGoal)}
              id={`goal-${enrolmentId}`}
              name="monthlyGoal"
              type="number"
              min={1}
              defaultValue={monthlyGoal ?? ''}
              placeholder={m.publishers_enrolment_goal_edit_placeholder()}
              className="max-w-[10rem]"
            />
          </div>
          <DialogFooter>
            <Button type="submit">{m.common_save()}</Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
