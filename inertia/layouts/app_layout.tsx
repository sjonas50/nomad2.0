import { Link, usePage } from '@inertiajs/react'
import { useState, type ReactNode } from 'react'

interface AppLayoutProps {
  children: ReactNode
}

const NAV_ITEMS = [
  { href: '/', label: 'Chat', icon: ChatIcon },
  { href: '/knowledge', label: 'Knowledge', icon: BookIcon },
  { href: '/library', label: 'Library', icon: LibraryIcon },
  { href: '/incidents', label: 'Incidents', icon: AlertIcon },
  { href: '/map', label: 'Map', icon: MapIcon },
  { href: '/services', label: 'Services', icon: ServerIcon },
  { href: '/mesh', label: 'Mesh', icon: MeshIcon },
  { href: '/wifi', label: 'WiFi', icon: WifiIcon },
]

export default function AppLayout({ children }: AppLayoutProps) {
  const { props, url } = usePage<{ auth?: { user?: { fullName: string; role: string } } }>()
  const user = props.auth?.user
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (href: string) => {
    if (href === '/') return url === '/'
    return url.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-surface-950 text-zinc-100">
      {/* Top nav */}
      <nav className="sticky top-0 z-50 border-b border-zinc-800/80 bg-surface-900/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4">
          {/* Left: logo + nav links */}
          <div className="flex items-center gap-1">
            <Link href="/" className="mr-4 flex items-center gap-2.5 shrink-0">
              <img src="/images/logo.png" alt="The Attic AI" className="h-8 w-8" />
              <span className="text-[15px] font-semibold text-white tracking-tight hidden sm:inline">
                The Attic AI
              </span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center">
              {NAV_ITEMS.map((item) => {
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                      active
                        ? 'text-white bg-zinc-800'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                    }`}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Link>
                )
              })}
              {user?.role === 'admin' && (
                <Link
                  href="/admin"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                    isActive('/admin')
                      ? 'text-white bg-zinc-800'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`}
                >
                  <ShieldIcon className="h-3.5 w-3.5" />
                  Admin
                </Link>
              )}
            </div>
          </div>

          {/* Right: user + mobile toggle */}
          <div className="flex items-center gap-3">
            {user && (
              <div className="hidden sm:flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-brand-500/20 flex items-center justify-center text-xs font-semibold text-brand-400">
                    {user.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-[13px]">
                    <span className="text-zinc-300">{user.fullName}</span>
                    <span className="ml-1.5 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-500 font-medium">
                      {user.role}
                    </span>
                  </div>
                </div>
                <Link
                  href="/logout"
                  method="post"
                  as="button"
                  className="text-[13px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Logout
                </Link>
              </div>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              {mobileOpen ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile nav drawer */}
        {mobileOpen && (
          <div className="md:hidden border-t border-zinc-800 bg-surface-900 px-4 py-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'text-white bg-zinc-800'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
            {user?.role === 'admin' && (
              <Link
                href="/admin"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive('/admin')
                    ? 'text-white bg-zinc-800'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <ShieldIcon className="h-4 w-4" />
                Admin
              </Link>
            )}
            {user && (
              <div className="pt-2 mt-2 border-t border-zinc-800 flex items-center justify-between">
                <span className="text-sm text-zinc-400">{user.fullName}</span>
                <Link
                  href="/logout"
                  method="post"
                  as="button"
                  className="text-sm text-zinc-500 hover:text-zinc-300"
                >
                  Logout
                </Link>
              </div>
            )}
          </div>
        )}
      </nav>

      <main>{children}</main>
    </div>
  )
}

/* ---- Compact SVG icons ---- */

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function LibraryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function MapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  )
}

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  )
}

function MeshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
    </svg>
  )
}

function WifiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  )
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}
