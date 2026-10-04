import { useEffect } from 'react'
import { navigate } from '../router.ts'

type Props = { title?: string; text?: string }

/** Unknown URL or a transaction that does not exist / is not yours. */
export function NotFoundScreen({ title = 'Page not found', text = 'This page does not exist.' }: Props) {
  useEffect(() => {
    const previous = document.title
    document.title = `${title} · Qavant Pay`
    return () => {
      document.title = previous
    }
  }, [title])

  return (
    <main className="center" data-testid="not-found-screen">
      <p className="not-found-code" aria-hidden="true">
        404
      </p>
      <h1 className="not-found-title" data-testid="not-found-title">
        {title}
      </h1>
      <p>{text}</p>
      <a
        href="/"
        className="text-button"
        data-testid="not-found-home"
        onClick={(e) => {
          e.preventDefault()
          navigate('/')
        }}
      >
        Back to home
      </a>
    </main>
  )
}
