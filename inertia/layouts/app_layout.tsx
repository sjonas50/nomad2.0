import { Link, usePage } from '@inertiajs/react'
import type { ReactNode } from 'react'

interface AppLayoutProps {
  children: ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { props } = usePage<{ auth?: { user?: { fullName: string; role: string } } }>()
  const user = props.auth?.user

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav className="border-b border-gray-800 bg-gray-900">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-semibold text-white">
              The Attic AI
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link
                href="/"
                className="text-gray-400 transition-colors hover:text-white"
              >
                Chat
              </Link>
              <Link
                href="/knowledge"
                className="text-gray-400 transition-colors hover:text-white"
              >
                Knowledge
              </Link>
              <Link
                href="/library"
                className="text-gray-400 transition-colors hover:text-white"
              >
                Library
              </Link>
              <Link
                href="/incidents"
                className="text-gray-400 transition-colors hover:text-white"
              >
                Incidents
              </Link>
              <Link
                href="/map"
                className="text-gray-400 transition-colors hover:text-white"
              >
                Map
              </Link>
              <Link
                href="/services"
                className="text-gray-400 transition-colors hover:text-white"
              >
                Services
              </Link>
              <Link
                href="/mesh"
                className="text-gray-400 transition-colors hover:text-white"
              >
                Mesh
              </Link>
              <Link
                href="/wifi"
                className="text-gray-400 transition-colors hover:text-white"
              >
                WiFi
              </Link>
              {user?.role === 'admin' && (
                <Link
                  href="/admin"
                  className="text-gray-400 transition-colors hover:text-white"
                >
                  Admin
                </Link>
              )}
            </div>
          </div>
          {user && (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-400">
                {user.fullName}{' '}
                <span className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-500">
                  {user.role}
                </span>
              </span>
              <Link
                href="/logout"
                method="post"
                as="button"
                className="text-gray-400 transition-colors hover:text-white"
              >
                Logout
              </Link>
            </div>
          )}
        </div>
      </nav>
      <main>{children}</main>
    </div>
  )
}
