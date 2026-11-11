import { redirect } from 'react-router'

// The old « Ajouter un orateur » page: a new speaker now opens in the list's panel.
export function loader() {
  return redirect('/programs/external-speakers?new')
}
