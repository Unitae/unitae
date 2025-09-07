import { TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router'

interface DeleteLinkProps {
  action?: string
  title?: string
  type?: 'trash' | 'cancel'
}

export function DeleteLink({ action, title, type = 'trash' }: DeleteLinkProps) {
  return (
    <Link
      to={action ?? ''}
      title={title}
      className={'rounded-lg bg-red-600 p-3 font-semibold text-white hover:bg-red-900 max-sm:p-2'}
    >
      {type === 'trash' && <TrashIcon className={'inline size-6 max-sm:size-5'} />}
      {type === 'cancel' && <XMarkIcon className={'inline size-6 max-sm:size-5'} />}
    </Link>
  )
}
