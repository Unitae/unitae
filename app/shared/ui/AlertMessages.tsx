import { Alert, AlertDescription } from '~/shared/ui/alert'

export function AlertMessages({ messages }: { messages: { success: string | undefined; error: string | undefined } }) {
  return (
    <>
      {messages.success && (
        <Alert className="border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-400">
          <AlertDescription>{messages.success}</AlertDescription>
        </Alert>
      )}
      {messages.error && (
        <Alert variant="destructive">
          <AlertDescription>{messages.error}</AlertDescription>
        </Alert>
      )}
    </>
  )
}
