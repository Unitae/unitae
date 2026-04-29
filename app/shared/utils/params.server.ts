import { redirect } from 'react-router'

export function requireParamId<T extends number = number>(param: string | undefined, redirectTo = '/'): T {
  const id = Number(param)
  if (Number.isNaN(id)) {
    throw redirect(redirectTo)
  }
  return id as T
}
