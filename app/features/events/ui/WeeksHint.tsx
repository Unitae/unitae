import * as m from '~/i18n/paraglide/messages'

/** How the programme and absence lists cut the period, at the end of their toolbar: « Semaines du lundi au dimanche ». */
export function WeeksHint() {
  return <span className="text-faint text-xs max-md:hidden">{m.programs_weeks_hint()}</span>
}
