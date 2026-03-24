import { Head, useForm } from '@inertiajs/react'
import type { FormEvent } from 'react'

export default function Login() {
  const { data, setData, post, processing, errors } = useForm({
    email: '',
    password: '',
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    post('/login')
  }

  return (
    <>
      <Head title="Login" />
      <div className="flex min-h-screen items-center justify-center bg-surface-950">
        <div className="w-full max-w-sm space-y-8 p-6">
          <div className="text-center">
            <img src="/images/logo.png" alt="The Attic AI" className="h-16 w-16 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white">The Attic AI</h1>
            <p className="mt-2 text-sm text-zinc-400">Sign in to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {(errors as Record<string, string>).login && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-center text-sm text-red-400">
                {(errors as Record<string, string>).login}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-300">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={data.email}
                onChange={(e) => setData('email', e.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-700 bg-surface-800 px-3 py-2.5 text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/30 transition-colors"
                placeholder="admin@example.com"
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-300">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={data.password}
                onChange={(e) => setData('password', e.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-700 bg-surface-800 px-3 py-2.5 text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/30 transition-colors"
                placeholder="Enter your password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={processing}
              className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {processing ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
