import { redirect } from 'react-router'

export function requireParamId(param: string | undefined, redirectTo = '/'): number {
  const id = Number(param)
  if (Number.isNaN(id)) {
    throw redirect(redirectTo)
  }
  return id
}
