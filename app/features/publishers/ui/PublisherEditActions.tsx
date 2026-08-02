import { KeyRound, RotateCcw, UnplugIcon, UserCheck, UserMinus, Zap, ZapOff } from 'lucide-react'
import { Form, useSubmit } from 'react-router'
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
  AlertDialogTrigger,
} from '~/shared/ui/alert-dialog'
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

// Header actions for the publisher edit page: login link/unlink and the lifecycle buttons
// (activate / mark inactive-active / mark left / mark returned). Each posts to a dedicated
// sub-route. Extracted from edit-publisher.tsx to keep the route thin.
interface PublisherEditActionsProps {
  user: {
    id: number
    email: string | null
    hasLogin: boolean
    leftAt: Date | null
    inactiveAt: Date | null
    isPublisher: boolean
  }
}

export default function PublisherEditActions({ user }: PublisherEditActionsProps) {
  const submit = useSubmit()

  return (
    <>
      {!user.hasLogin ? (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" title={m.publishers_edit_link_login_title()}>
              <KeyRound className="size-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <Form method="post" action={`/publishers/${user.id}/link-login`}>
              <DialogHeader>
                <DialogTitle>{m.publishers_edit_link_login_dialog_title()}</DialogTitle>
                <DialogDescription>{m.publishers_edit_link_login_dialog_description()}</DialogDescription>
              </DialogHeader>
              <div className="my-4 flex flex-col gap-2">
                <Label htmlFor="link-login-email">{m.publishers_edit_link_login_email_label()}</Label>
                {/* Seed the login email from the contact email — they may then diverge. */}
                <Input id="link-login-email" name="email" type="email" defaultValue={user.email ?? ''} required />
              </div>
              <DialogFooter>
                <Button type="submit">{m.publishers_edit_link_login_submit()}</Button>
              </DialogFooter>
            </Form>
          </DialogContent>
        </Dialog>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="icon" title={m.publishers_edit_unlink_login_title()}>
              <UnplugIcon className="size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{m.publishers_edit_unlink_login_dialog_title()}</AlertDialogTitle>
              <AlertDialogDescription>{m.publishers_edit_unlink_login_dialog_description()}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => submit(null, { method: 'post', action: `/publishers/${user.id}/unlink-login` })}
              >
                {m.publishers_edit_unlink_login_submit()}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {user.leftAt != null ? (
        <Form method="post" action={`/publishers/${user.id}/mark-as-returned`}>
          <Button type="submit" size="icon" title={m.publishers_view_mark_as_returned_title()}>
            <RotateCcw className="size-4" />
          </Button>
        </Form>
      ) : user.isPublisher ? (
        <>
          {user.inactiveAt != null ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="icon" title={m.publishers_view_mark_as_active_title()}>
                  <Zap className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{m.publishers_view_mark_as_active_dialog_title()}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {m.publishers_view_mark_as_active_dialog_description()}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => submit(null, { method: 'post', action: `/publishers/${user.id}/mark-as-active` })}
                  >
                    {m.publishers_view_mark_as_active_confirm()}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="icon" title={m.publishers_view_mark_as_inactive_title()}>
                  <ZapOff className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{m.publishers_view_mark_as_inactive_dialog_title()}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {m.publishers_view_mark_as_inactive_dialog_description()}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => submit(null, { method: 'post', action: `/publishers/${user.id}/mark-as-inactive` })}
                  >
                    {m.publishers_view_mark_as_inactive_confirm()}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="secondary" size="icon" title={m.publishers_edit_deactivate_title()}>
                <UserMinus className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{m.publishers_view_mark_as_left_dialog_title()}</AlertDialogTitle>
                <AlertDialogDescription>{m.publishers_view_mark_as_left_dialog_description()}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => submit(null, { method: 'post', action: `/publishers/${user.id}/mark-as-left` })}
                >
                  {m.publishers_view_mark_as_left_confirm()}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="icon" title={m.publishers_edit_activate_title()}>
              <UserCheck className="size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{m.publishers_view_make_publisher_dialog_title()}</AlertDialogTitle>
              <AlertDialogDescription>{m.publishers_view_make_publisher_dialog_description()}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => submit(null, { method: 'post', action: `/publishers/${user.id}/make-publisher` })}
              >
                {m.publishers_view_make_publisher_confirm()}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
