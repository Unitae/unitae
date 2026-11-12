import { Lockup } from '@unitae/ui'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import * as m from '~/i18n/paraglide/messages'

import { getCongregationBrand } from '~/shared/domain/congregation.server'
import { getHostSettings } from '~/shared/domain/host-settings.server'
import { Button } from '~/shared/ui/button'
import { Monogram } from '~/shared/ui/ShellMenus'

import type { Route } from './+types/privacy'
import { Contents, useSectionInView } from './PrivacyContents'
import { OperatorPolicyLink, type PrivacyInstance, privacySections } from './PrivacySections'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.privacy_title()} - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { operator } = getHostSettings()
  const instance: PrivacyInstance = {
    managedHosting: operator?.managedHosting === true,
    operatorName: operator?.name ?? null,
    privacyContact: operator?.privacyContact ?? null,
    privacyPolicyUrl: operator?.privacyPolicyUrl ?? null,
  }
  return { congregation: await getCongregationBrand(request), instance }
}

export default function PrivacyPolicyPage({ loaderData }: Route.ComponentProps) {
  const { congregation, instance } = loaderData
  const sections = privacySections(instance)
  const current = useSectionInView(sections)

  return (
    <div className="min-h-svh bg-background">
      <header className="flex h-14 items-center gap-3 border-b px-4 md:px-6">
        {congregation == null ? (
          <Lockup size={18} />
        ) : (
          <>
            <Monogram name={congregation} className="size-6.5 rounded-md text-[11px]" />
            <span className="truncate font-medium text-sm">{congregation}</span>
          </>
        )}
        <span className="flex-1" />
        <BackButton />
      </header>
      <div className="mx-auto flex max-w-[70rem] items-start gap-14 px-4 pt-10 pb-24 md:px-8 md:pt-12">
        <nav aria-label={m.privacy_toc()} className="sticky top-6 w-60 shrink-0 max-lg:hidden">
          <p className="mb-1.5 px-2.5 font-medium text-faint text-xs">{m.privacy_toc()}</p>
          <Contents sections={sections} current={current} />
        </nav>
        <article className="flex min-w-0 max-w-[68ch] flex-1 flex-col gap-9">
          <div className="flex flex-col gap-2">
            <h1 className="text-h1">{m.privacy_title()}</h1>
            <p className="text-faint text-sm">{m.privacy_last_updated()}</p>
          </div>
          <details className="group rounded-md border bg-card lg:hidden">
            <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-3 text-sm">
              {m.privacy_toc_count({ count: sections.length })}
              <ChevronDown
                aria-hidden="true"
                className="size-4 text-faint transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="border-t p-1.5">
              <Contents sections={sections} current={current} />
            </div>
          </details>
          {instance.privacyPolicyUrl != null && <OperatorBox instance={instance} />}
          {sections.map(section => (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-6">
              <h2 id={`${section.id}-title`} className="mb-2.5 font-semibold text-lg tracking-tight">
                <span className="mr-1.5 text-faint tabular-nums">{section.number}.</span>
                {section.title}
              </h2>
              <div className="flex flex-col gap-2.5 text-[15px] leading-[1.65] [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5">
                {section.body}
              </div>
            </section>
          ))}
        </article>
      </div>
    </div>
  )
}

/** The operator's own policy, announced first: it complements this one, it does not replace it. */
function OperatorBox({ instance }: { instance: PrivacyInstance }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-sidebar px-4 py-3 text-sm leading-relaxed">
      <p className="text-muted-foreground">
        {instance.operatorName
          ? m.privacy_operator_named({ operator: instance.operatorName })
          : m.privacy_operator_unnamed()}
      </p>
      <OperatorPolicyLink instance={instance} />
    </div>
  )
}

/** Back where the reader came from — the sign-in page, the consent, the app — or home when the page was opened alone. */
function BackButton() {
  const navigate = useNavigate()
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link
        to="/"
        onClick={event => {
          if (window.history.length <= 1) return
          event.preventDefault()
          navigate(-1)
        }}
      >
        <ArrowLeft aria-hidden="true" />
        {m.privacy_back()}
      </Link>
    </Button>
  )
}
