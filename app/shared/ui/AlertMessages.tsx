export function AlertMessages({ messages }: { messages: { success: string | undefined; error: string | undefined } }) {
  return (
    <>
      {messages.success && (
        <div
          className="mx-10 mt-6 mb-3 rounded-md border border-green-300 bg-green-100 p-3 text-green-600"
          role="alert"
        >
          <span className="block sm:inline">{messages.success}</span>
        </div>
      )}
      {messages.error && (
        <div className="mx-10 mt-6 mb-3 rounded-md border border-red-300 bg-red-100 p-3 text-red-600" role="alert">
          <span className="block sm:inline">{messages.error}</span>
        </div>
      )}
    </>
  )
}
