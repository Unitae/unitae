import type { UserInput } from '~/shared/types/user-input'

export default function PublisherNominationForm({ user }: { user?: UserInput }) {
  return (
    <>
      <h2 className="font-semibold text-xl max-sm:text-lg">Nomination</h2>
      <label className="flex flex-grow items-center gap-1 max-sm:gap-3">
        <input
          className="rounded-md border dark:border-gray-300"
          name="isServant"
          type="checkbox"
          defaultChecked={user?.isServant}
        />
        <span>
          Le proclamateur est <span className="font-bold text-teal-600">assistant</span> dans l'assemblée.
        </span>
      </label>
      <label className="flex flex-grow items-center gap-1 max-sm:gap-3">
        <input
          className="rounded-md border dark:border-gray-300"
          name="isHelder"
          type="checkbox"
          defaultChecked={user?.isHelder}
        />
        <span>
          Le proclamateur est <span className="font-bold text-teal-600">ancien</span> dans l'assemblée.
        </span>
      </label>
    </>
  )
}
