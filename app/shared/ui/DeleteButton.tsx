import { TrashIcon } from '@heroicons/react/24/outline'
import { Form } from 'react-router'

interface DeleteButtonProps {
  action?: string
  title?: string
}

export function DeleteButton({ action, title }: DeleteButtonProps) {
  return (
    <Form method="post" action={action}>
      <button
        type="submit"
        title={title}
        className={'rounded-lg bg-red-600 p-3 font-semibold text-white hover:bg-red-900 max-sm:p-2'}
      >
        <TrashIcon className={'inline size-6 max-sm:size-5'} />
      </button>
    </Form>
  )
}
