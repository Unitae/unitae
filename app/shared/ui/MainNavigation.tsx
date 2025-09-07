import { Bars4Icon, UserIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { Form, Link, NavLink } from 'react-router'

export function MainNavigation(props: {
  showBoard: boolean
  showTerritories: boolean
  showSettings: boolean
  showCongregation: boolean
}) {
  const [shouldShowMenu, setShouldShowMenu] = useState(false)
  const [shouldShowMainMenu, setShouldShowMainMenu] = useState(false)

  return (
    <div className="m-3 flex place-content-between rounded-md bg-gray-200">
      <button
        className="m-4 hidden max-sm:inline-block"
        type="button"
        onClick={() => setShouldShowMainMenu(!shouldShowMainMenu)}
      >
        <Bars4Icon className="inline size-8 text-teal-600" />
      </button>
      {shouldShowMainMenu && (
        <div className="absolute top-[70px] right-0 z-10 w-max rounded-md bg-gray-200 max-sm:fixed max-sm:top-0 max-sm:h-screen max-sm:w-screen max-sm:rounded-none dark:text-slate-900">
          <nav>
            <ul className="list-none max-sm:py-20">
              <li className="my-5 hidden px-5 py-3 max-sm:block max-sm:text-center">
                <button type="button" onClick={() => setShouldShowMainMenu(!shouldShowMainMenu)}>
                  <XMarkIcon className="size-10" />
                </button>
              </li>
              {props.showBoard && (
                <li className="px-5 max-sm:text-center">
                  <Link
                    to={'/board'}
                    className="my-2 inline-block w-full rounded-md bg-gray-900 px-10 py-3 text-gray-200"
                  >
                    Tableau d'affichage
                  </Link>
                </li>
              )}
              {props.showCongregation && (
                <li className="px-5 max-sm:text-center">
                  <Link
                    to={'/congregation/publishers'}
                    className="my-2 inline-block w-full rounded-md bg-gray-900 px-10 py-3 text-gray-200"
                  >
                    Assemblée
                  </Link>
                </li>
              )}
              {props.showTerritories && (
                <li className="px-5 max-sm:text-center">
                  <Link
                    to={'/territories/attributions'}
                    className="my-2 inline-block w-full rounded-md bg-gray-900 px-10 py-3 text-gray-200"
                  >
                    Territoires
                  </Link>
                </li>
              )}
              {props.showSettings && (
                <li className="px-5 max-sm:text-center">
                  <Link
                    to={'/settings'}
                    className="my-2 inline-block w-full rounded-md bg-gray-900 px-10 py-3 text-gray-200"
                  >
                    Réglages
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        </div>
      )}
      <nav className="flex list-none gap-3 p-2 max-sm:hidden">
        {props.showBoard && (
          <NavLink
            to={'/board'}
            className={({ isActive }) =>
              isActive
                ? 'block rounded-md bg-teal-700 p-3 text-white hover:bg-teal-900'
                : 'block rounded-md p-3 hover:bg-teal-700 hover:bg-opacity-50 dark:text-slate-900'
            }
          >
            Tableau d'affichage
          </NavLink>
        )}
        {props.showCongregation && (
          <NavLink
            to={'/congregation/publishers'}
            className={({ isActive }) =>
              isActive
                ? 'block rounded-md bg-teal-700 p-3 text-white hover:bg-teal-900'
                : 'block rounded-md p-3 hover:bg-teal-700 hover:bg-opacity-50 dark:text-slate-900'
            }
          >
            Assemblée
          </NavLink>
        )}
        {props.showTerritories && (
          <NavLink
            to={'/territories/attributions'}
            className={({ isActive }) =>
              isActive
                ? 'block rounded-md bg-teal-700 p-3 text-white hover:bg-teal-900'
                : 'block rounded-md p-3 hover:bg-teal-700 hover:bg-opacity-50 dark:text-slate-900'
            }
          >
            Territoires
          </NavLink>
        )}
        {props.showSettings && (
          <NavLink
            to={'/settings'}
            className={({ isActive }) =>
              isActive
                ? 'block rounded-md bg-teal-700 p-3 text-white hover:bg-teal-900'
                : 'block rounded-md p-3 hover:bg-teal-700 hover:bg-opacity-50 dark:text-slate-900'
            }
          >
            Réglages
          </NavLink>
        )}
      </nav>
      <div className="relative m-0 flex p-0">
        <button
          type="button"
          className="m-2 flex items-center justify-center rounded-full bg-slate-400 p-2 text-slate-600"
          onClick={() => setShouldShowMenu(!shouldShowMenu)}
        >
          <UserIcon className="mx-1 inline size-6" />
        </button>
        {shouldShowMenu && (
          <div className="absolute top-[70px] right-0 z-10 w-max rounded-md bg-gray-200 max-sm:fixed max-sm:top-0 max-sm:h-screen max-sm:w-screen max-sm:rounded-none dark:text-slate-900">
            <nav>
              <ul className="list-none max-sm:py-20">
                <li className="my-5 hidden px-5 py-3 max-sm:block max-sm:text-center">
                  <button type="button" onClick={() => setShouldShowMenu(!shouldShowMenu)}>
                    <XMarkIcon className="size-10" />
                  </button>
                </li>
                <li className="px-5 py-3 max-sm:text-center">
                  <Link to={'/me/profile'}>Mon compte utilisateur</Link>
                </li>
                <li className="px-5 py-3 max-sm:text-center">
                  <Link to={'/me/days-off'}>Mes absences</Link>
                </li>
                <li className="px-5 py-3 max-sm:text-center">
                  <Form action="/logout" method="post">
                    <button
                      type="submit"
                      className="text-red-600 max-sm:my-3 max-sm:rounded-md max-sm:bg-red-600 max-sm:px-10 max-sm:py-3 max-sm:text-gray-200"
                    >
                      Déconnexion
                    </button>
                  </Form>
                </li>
              </ul>
            </nav>
          </div>
        )}
      </div>
    </div>
  )
}
