import { useEffect, useRef, useState } from 'react'
import { useNavigation } from 'react-router'

export function NavigationProgress() {
  const navigation = useNavigation()
  const isNavigating = navigation.state !== 'idle'
  const [show, setShow] = useState(false)
  const [completing, setCompleting] = useState(false)
  const delayRef = useRef<ReturnType<typeof setTimeout>>(null)
  const hideRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    if (isNavigating) {
      setCompleting(false)
      if (hideRef.current) clearTimeout(hideRef.current)
      delayRef.current = setTimeout(() => setShow(true), 300)
    } else if (show) {
      setCompleting(true)
      hideRef.current = setTimeout(() => {
        setShow(false)
        setCompleting(false)
      }, 300)
    }

    return () => {
      if (delayRef.current) clearTimeout(delayRef.current)
      if (hideRef.current) clearTimeout(hideRef.current)
    }
  }, [isNavigating, show])

  if (!show) return null

  return (
    <div className="fixed inset-x-0 top-0 z-50 h-0.5">
      <div
        className={`h-full bg-primary ${completing ? 'w-full transition-all duration-200' : 'animate-navigation-progress'}`}
      />
    </div>
  )
}
