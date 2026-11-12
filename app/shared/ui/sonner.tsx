'use client'

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

function useLocalTheme() {
  const [theme, setTheme] = useState<string>('system')

  useEffect(() => {
    setTheme(localStorage.getItem('theme') ?? 'system')
  }, [])

  return { theme }
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useLocalTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          // A confirmation is an inverse strip, as on the boards: the text colour as its ground.
          '--normal-bg': 'var(--u-fg)',
          '--normal-text': 'var(--u-bg)',
          '--normal-border': 'transparent',
          '--border-radius': 'var(--u-radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
