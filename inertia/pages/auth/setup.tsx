import { Head, useForm } from '@inertiajs/react'
import { type FormEvent, useState } from 'react'

const OPTIONAL_SERVICES = [
  {
    key: 'falkordb',
    name: 'Knowledge Graph (FalkorDB)',
    description: 'Enables graph-based RAG — extracts entities and relationships from your documents for deeper, more connected answers. Requires ~512 MB RAM.',
    recommended: false,
  },
  {
    key: 'sidecar',
    name: 'Python Sidecar',
    description: 'Enables advanced document processing — ZIM file extraction, entity extraction, and NLP-powered analysis. Requires Python 3.11+.',
    recommended: false,
  },
  {
    key: 'mesh',
    name: 'Meshtastic Mesh Network',
    description: 'Connect to Meshtastic LoRa mesh radios for off-grid text messaging and position tracking. Requires a Meshtastic radio and MQTT broker.',
    recommended: false,
  },
] as const

export default function Setup() {
  const { data, setData, post, processing, errors } = useForm({
    fullName: '',
    email: '',
    password: '',
    enableFalkordb: false,
    enableSidecar: false,
    enableMesh: false,
  })

  const [step, setStep] = useState<'account' | 'services'>('account')

  function handleAccountNext(e: FormEvent) {
    e.preventDefault()
    if (!data.fullName.trim() || !data.email.trim() || data.password.length < 8) return
    setStep('services')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    post('/setup')
  }

  return (
    <>
      <Head title="Setup" />
      <div className="flex min-h-screen items-center justify-center bg-surface-950">
        <div className="w-full max-w-md space-y-8 p-6">
          <div className="text-center">
            <img src="/images/logo.png" alt="The Attic AI" className="h-16 w-16 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white">Welcome to The Attic AI</h1>
            <p className="mt-2 text-sm text-zinc-400">
              {step === 'account' ? 'Create your admin account to get started' : 'Configure optional services'}
            </p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 justify-center">
            <div className={`h-1.5 w-16 rounded-full transition-colors ${step === 'account' ? 'bg-brand-500' : 'bg-brand-500'}`} />
            <div className={`h-1.5 w-16 rounded-full transition-colors ${step === 'services' ? 'bg-brand-500' : 'bg-zinc-800'}`} />
          </div>

          {/* Step 1: Account */}
          {step === 'account' && (
            <form onSubmit={handleAccountNext} className="space-y-4">
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-zinc-300">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={data.fullName}
                  onChange={(e) => setData('fullName', e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-zinc-700 bg-surface-800 px-3 py-2.5 text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/30 transition-colors"
                  placeholder="Jane Doe"
                  required
                  autoFocus
                />
                {errors.fullName && <p className="mt-1 text-sm text-red-400">{errors.fullName}</p>}
              </div>

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
                />
                {errors.email && <p className="mt-1 text-sm text-red-400">{errors.email}</p>}
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
                  placeholder="Min. 8 characters"
                  required
                  minLength={8}
                />
                {errors.password && <p className="mt-1 text-sm text-red-400">{errors.password}</p>}
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                Next: Optional Services
              </button>
            </form>
          )}

          {/* Step 2: Optional Services */}
          {step === 'services' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-zinc-500">
                The core system (AI chat, knowledge base, maps) works without any of these. Enable them only if you need the extra capability.
              </p>

              <div className="space-y-3">
                {OPTIONAL_SERVICES.map((svc) => {
                  const formKey = `enable${svc.key.charAt(0).toUpperCase() + svc.key.slice(1)}` as
                    'enableFalkordb' | 'enableSidecar' | 'enableMesh'
                  const checked = data[formKey]
                  return (
                    <label
                      key={svc.key}
                      className={`block rounded-xl border p-4 cursor-pointer transition-all ${
                        checked
                          ? 'bg-brand-500/5 border-brand-500/30'
                          : 'bg-surface-800 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">
                          <div
                            className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                              checked
                                ? 'bg-brand-500 border-brand-500'
                                : 'border-zinc-600 bg-transparent'
                            }`}
                          >
                            {checked && (
                              <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setData(formKey, e.target.checked)}
                            className="sr-only"
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">{svc.name}</span>
                            {svc.recommended && (
                              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400">
                                Recommended
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{svc.description}</p>
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('account')}
                  className="flex-1 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
                >
                  {processing ? 'Setting up...' : 'Create Admin Account'}
                </button>
              </div>
            </form>
          )}

          <p className="text-center text-xs text-zinc-600">
            {step === 'account'
              ? 'This creates the first admin account. Additional users can be added later.'
              : 'You can change these settings anytime from the Admin dashboard.'}
          </p>
        </div>
      </div>
    </>
  )
}
