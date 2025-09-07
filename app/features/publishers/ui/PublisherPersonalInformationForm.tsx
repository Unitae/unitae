import type { UserInput } from '~/shared/types/user-input'

export default function PublisherPersonalInformationForm({ user }: { user?: UserInput }) {
  return (
    <>
      <h2 className="font-semibold text-xl max-sm:text-lg">Information personnelles</h2>
      <div className="flex gap-3">
        <label className="flex-1">
          Prénom
          <input
            className="w-full rounded-md border p-1 dark:border-gray-300"
            name="firstname"
            type="text"
            placeholder="Prénom"
            required
            defaultValue={user?.firstname ?? ''}
          />
        </label>
        <label className="flex-1">
          Nom
          <input
            className="w-full rounded-md border p-1 dark:border-gray-300"
            name="lastname"
            type="text"
            placeholder="Nom"
            defaultValue={user?.lastname ?? ''}
            required
          />
        </label>
      </div>
      <div className="flex gap-3">
        <label className="flex-1">
          Date de naissance
          <input
            className="w-full rounded-md border p-1 dark:border-gray-300"
            name="birthDate"
            type="date"
            defaultValue={user?.birthDate?.toLocaleDateString('en-CA') ?? ''}
          />
        </label>
        <label className="flex-1">
          Date de baptême
          <input
            className="w-full rounded-md border p-1 dark:border-gray-300"
            name="baptismDate"
            type="date"
            defaultValue={user?.baptismDate?.toLocaleDateString('en-CA') ?? ''}
          />
        </label>
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <p>Genre :</p>
          <div className="flex flex-grow items-center gap-3">
            <label className="flex gap-1">
              Homme
              <input
                className="rounded-md border dark:border-gray-300"
                name="gender"
                type="radio"
                value="male"
                required
                defaultChecked={user?.isMale === true}
              />
            </label>
            <label className="flex gap-1">
              Femme
              <input
                className="rounded-md border dark:border-gray-300"
                name="gender"
                type="radio"
                value="female"
                required
                defaultChecked={user?.isMale === false}
              />
            </label>
          </div>
        </div>
        <label className="flex flex-1 items-center gap-1 max-sm:gap-3">
          <input
            className="rounded-md border dark:border-gray-300"
            name="isAnointed"
            type="checkbox"
            defaultChecked={user?.isAnointed}
          />
          <span>
            Le proclamateur est <span className="font-bold text-teal-600">oint</span>.
          </span>
        </label>
      </div>
      <label className="flex-1">
        Email
        <input
          className="w-full rounded-md border p-1 dark:border-gray-300"
          name="email"
          type="email"
          placeholder="Email"
          defaultValue={user?.email ?? ''}
        />
      </label>
      <div className="flex gap-3">
        <label className="flex-1">
          Téléphone
          <input
            className="w-full rounded-md border p-1 dark:border-gray-300"
            name="phone"
            type="text"
            placeholder="Téléphone"
            defaultValue={user?.phone ?? ''}
          />
        </label>
        <label className="flex-1">
          Adresse
          <input
            className="w-full rounded-md border p-1 dark:border-gray-300"
            name="address"
            type="text"
            placeholder="Domicile"
            defaultValue={user?.address ?? ''}
          />
        </label>
      </div>
    </>
  )
}
