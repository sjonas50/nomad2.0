import { Head, Link } from '@inertiajs/react'
import { useState, useEffect, useRef, useCallback } from 'react'
import AppLayout from '~/layouts/app_layout'
import { apiFetch } from '~/lib/fetch'

interface ServiceInfo {
  name: string
  status: 'up' | 'down' | 'degraded'
  message: string | null
  required: boolean
}

interface OnboardingStep {
  id: string
  title: string
  description: string
  status: 'complete' | 'pending'
  // services step
  services?: ServiceInfo[]
  optionalServices?: ServiceInfo[]
  // model steps
  model?: string | null
  modelName?: string
  ollamaUp?: boolean
  // knowledge step
  count?: number
}

interface OnboardingStatus {
  steps: OnboardingStep[]
  models: string[]
  allComplete: boolean
}

export default function Onboarding() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [pulling, setPulling] = useState<string | null>(null)
  const [pullProgress, setPullProgress] = useState('')
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadingText, setUploadingText] = useState(false)
  const [textTitle, setTextTitle] = useState('')
  const [textContent, setTextContent] = useState('')
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding/status')
      if (res.ok) setStatus(await res.json())
    } catch { /* */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  // Find the first incomplete step
  const currentStepIndex = status?.steps.findIndex((s) => s.status === 'pending') ?? -1

  const pullModel = async (modelName: string) => {
    setPulling(modelName)
    setPullProgress('Starting download...')
    setMessage(null)

    try {
      const res = await apiFetch('/api/onboarding/pull-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed' }))
        setMessage({ text: data.error || 'Pull failed', type: 'error' })
        setPulling(null)
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) return

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        for (const line of text.split('\n').filter(Boolean)) {
          try {
            const data = JSON.parse(line)
            if (data.done) {
              setPullProgress('')
              setMessage({ text: `${modelName} installed successfully!`, type: 'success' })
            } else if (data.error) {
              setMessage({ text: data.error, type: 'error' })
            } else if (data.status) {
              const pct = data.completed && data.total
                ? ` (${Math.round((data.completed / data.total) * 100)}%)`
                : ''
              setPullProgress(`${data.status}${pct}`)
            }
          } catch { /* skip malformed lines */ }
        }
      }
    } catch {
      setMessage({ text: 'Connection lost during download', type: 'error' })
    }

    setPulling(null)
    fetchStatus()
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingFile(true)
    setMessage(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await apiFetch('/api/knowledge/upload', { method: 'POST', body: formData })
      if (res.ok) {
        setMessage({ text: `"${file.name}" uploaded! It will be processed automatically.`, type: 'success' })
        setTimeout(fetchStatus, 2000)
      } else {
        setMessage({ text: 'Upload failed. Try again.', type: 'error' })
      }
    } catch {
      setMessage({ text: 'Upload failed.', type: 'error' })
    }
    setUploadingFile(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleTextUpload = async () => {
    if (!textTitle.trim() || !textContent.trim()) return
    setUploadingText(true)
    setMessage(null)
    try {
      const res = await apiFetch('/api/knowledge/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: textTitle, content: textContent }),
      })
      if (res.ok) {
        setMessage({ text: 'Text added to knowledge base!', type: 'success' })
        setTextTitle('')
        setTextContent('')
        setTimeout(fetchStatus, 2000)
      } else {
        setMessage({ text: 'Upload failed.', type: 'error' })
      }
    } catch {
      setMessage({ text: 'Upload failed.', type: 'error' })
    }
    setUploadingText(false)
  }

  const completedCount = status?.steps.filter((s) => s.status === 'complete').length ?? 0
  const totalSteps = status?.steps.length ?? 4

  return (
    <AppLayout>
      <Head title="Getting Started" />
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <img src="/images/logo.png" alt="The Attic AI" className="h-14 w-14 mx-auto" />
          <h1 className="text-2xl font-bold text-white">Getting Started</h1>
          <p className="text-zinc-400 text-sm max-w-md mx-auto">
            Follow these steps to get your AI system ready. Each step builds on the previous one.
          </p>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500">{completedCount} of {totalSteps} complete</span>
            {status?.allComplete && <span className="text-green-400 font-medium">Ready to go!</span>}
          </div>
          <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden border border-zinc-800">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-500"
              style={{ width: `${totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Message toast */}
        {message && (
          <div className={`rounded-xl px-4 py-3 text-sm flex items-center justify-between ${
            message.type === 'error'
              ? 'bg-red-500/10 border border-red-500/20 text-red-400'
              : 'bg-green-500/10 border border-green-500/20 text-green-400'
          }`}>
            {message.text}
            <button onClick={() => setMessage(null)} className="ml-2 text-zinc-500 hover:text-zinc-300">&times;</button>
          </div>
        )}

        {loading && (
          <div className="text-center py-16">
            <div className="inline-flex items-center gap-2 text-zinc-500 text-sm">
              <Spinner /> Checking system status...
            </div>
          </div>
        )}

        {status && (
          <div className="space-y-3">
            {/* Step 1: Services */}
            {renderServicesStep(status.steps.find((s) => s.id === 'services')!, currentStepIndex === 0)}

            {/* Step 2: Embedding Model */}
            {renderModelStep(
              status.steps.find((s) => s.id === 'embedding_model')!,
              2,
              currentStepIndex === 1,
              pulling,
              pullProgress,
              pullModel
            )}

            {/* Step 3: Chat Model */}
            {renderModelStep(
              status.steps.find((s) => s.id === 'chat_model')!,
              3,
              currentStepIndex === 2,
              pulling,
              pullProgress,
              pullModel
            )}

            {/* Step 4: Knowledge */}
            {renderKnowledgeStep(
              status.steps.find((s) => s.id === 'knowledge')!,
              currentStepIndex === 3,
              {
                uploadingFile, uploadingText, textTitle, textContent,
                setTextTitle, setTextContent,
                handleFileUpload, handleTextUpload, fileInputRef,
              }
            )}
          </div>
        )}

        {/* Bottom actions */}
        <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
          <button
            onClick={() => { setLoading(true); fetchStatus() }}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Refresh
          </button>
          <Link
            href="/"
            className={`px-5 py-2.5 text-sm rounded-xl font-medium transition-colors ${
              status?.allComplete
                ? 'bg-brand-500 text-white hover:bg-brand-600'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
          >
            {status?.allComplete ? 'Start Chatting' : 'Skip for Now'}
          </Link>
        </div>
      </div>
    </AppLayout>
  )
}

/* ---- Step Renderers ---- */

function renderServicesStep(step: OnboardingStep, isCurrent: boolean) {
  const isComplete = step.status === 'complete'
  return (
    <StepCard step={step} number={1} isCurrent={isCurrent}>
      {/* Required services */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        {step.services?.map((svc) => (
          <div
            key={svc.name}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm border ${
              svc.status === 'up'
                ? 'bg-green-500/5 border-green-500/20 text-green-400'
                : 'bg-red-500/5 border-red-500/20 text-red-400'
            }`}
          >
            <span className={`h-2 w-2 rounded-full shrink-0 ${svc.status === 'up' ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="capitalize">{svc.name}</span>
          </div>
        ))}
      </div>

      {/* Optional services — collapsed, not alarming */}
      {step.optionalServices && step.optionalServices.length > 0 && (
        <div className="mt-3 text-xs text-zinc-600">
          <span className="font-medium text-zinc-500">Optional: </span>
          {step.optionalServices.map((s) => (
            <span key={s.name} className="capitalize">
              {s.name} ({s.status === 'up' ? 'running' : 'not running'})
              {s !== step.optionalServices![step.optionalServices!.length - 1] ? ', ' : ''}
            </span>
          ))}
        </div>
      )}

      {!isComplete && isCurrent && (
        <div className="mt-3 p-3 rounded-lg bg-surface-900 border border-zinc-800 text-sm">
          <p className="text-zinc-300 mb-1">Start the required services:</p>
          <code className="text-xs text-brand-400">docker compose up -d</code>
        </div>
      )}
    </StepCard>
  )
}

function renderModelStep(
  step: OnboardingStep,
  number: number,
  isCurrent: boolean,
  pulling: string | null,
  pullProgress: string,
  onPull: (model: string) => void
) {
  const isComplete = step.status === 'complete'
  const isPulling = pulling === step.modelName
  const isOtherPulling = pulling !== null && pulling !== step.modelName
  const blocked = !step.ollamaUp

  return (
    <StepCard step={step} number={number} isCurrent={isCurrent}>
      {isComplete ? (
        <div className="mt-2 flex items-center gap-2 text-sm text-green-400">
          <CheckCircle />
          <span>Installed: <span className="font-mono text-xs">{step.model}</span></span>
        </div>
      ) : isCurrent || step.status === 'pending' ? (
        <div className="mt-3 space-y-3">
          {blocked ? (
            <p className="text-sm text-zinc-500">Waiting for Ollama to be running (Step 1)</p>
          ) : isPulling ? (
            <div className="flex items-center gap-3">
              <Spinner />
              <div className="flex-1">
                <div className="text-sm text-zinc-300">{pullProgress || 'Downloading...'}</div>
                <div className="mt-1.5 h-1 bg-surface-900 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => onPull(step.modelName!)}
              disabled={isOtherPulling}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-500 text-white text-sm rounded-xl font-medium hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <DownloadIcon />
              Install {step.modelName}
            </button>
          )}

          {!blocked && !isPulling && (
            <p className="text-xs text-zinc-600 text-center">
              Or run: <code className="text-zinc-500">docker exec attic_ollama ollama pull {step.modelName}</code>
            </p>
          )}
        </div>
      ) : null}
    </StepCard>
  )
}

function renderKnowledgeStep(
  step: OnboardingStep,
  isCurrent: boolean,
  ctx: {
    uploadingFile: boolean
    uploadingText: boolean
    textTitle: string
    textContent: string
    setTextTitle: (v: string) => void
    setTextContent: (v: string) => void
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
    handleTextUpload: () => void
    fileInputRef: React.RefObject<HTMLInputElement | null>
  }
) {
  const isComplete = step.status === 'complete'

  return (
    <StepCard step={step} number={4} isCurrent={isCurrent}>
      {isComplete ? (
        <div className="mt-2 flex items-center gap-2 text-sm text-green-400">
          <CheckCircle />
          <span>{step.count} source(s) in knowledge base</span>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-zinc-400">
            Upload a file or paste text so the AI has something to search. This step is optional — you can always add knowledge later.
          </p>

          {/* File upload */}
          <label className={`flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-zinc-700 rounded-xl text-sm text-zinc-400 cursor-pointer hover:border-zinc-500 hover:text-zinc-300 transition-colors ${ctx.uploadingFile ? 'opacity-50 pointer-events-none' : ''}`}>
            <UploadIcon />
            {ctx.uploadingFile ? 'Uploading...' : 'Choose a file to upload'}
            <input
              ref={ctx.fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.html,.csv,.json"
              onChange={ctx.handleFileUpload}
              className="hidden"
              disabled={ctx.uploadingFile}
            />
          </label>
          <p className="text-xs text-zinc-600 text-center">PDF, TXT, Markdown, HTML, CSV, or JSON</p>

          {/* Text paste */}
          <details className="group">
            <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400 transition-colors">
              Or paste text directly...
            </summary>
            <div className="mt-2 space-y-2 p-3 rounded-lg bg-surface-900 border border-zinc-800">
              <input
                type="text"
                value={ctx.textTitle}
                onChange={(e) => ctx.setTextTitle(e.target.value)}
                placeholder="Title"
                className="w-full bg-surface-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
              />
              <textarea
                value={ctx.textContent}
                onChange={(e) => ctx.setTextContent(e.target.value)}
                placeholder="Paste content here..."
                rows={3}
                className="w-full bg-surface-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-brand-500"
              />
              <button
                onClick={ctx.handleTextUpload}
                disabled={ctx.uploadingText || !ctx.textTitle.trim() || !ctx.textContent.trim()}
                className="px-4 py-1.5 bg-brand-500 text-white text-sm rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                {ctx.uploadingText ? 'Adding...' : 'Add to Knowledge Base'}
              </button>
            </div>
          </details>
        </div>
      )}
    </StepCard>
  )
}

/* ---- Shared Components ---- */

function StepCard({
  step,
  number,
  isCurrent,
  children,
}: {
  step: OnboardingStep
  number: number
  isCurrent: boolean
  children?: React.ReactNode
}) {
  const isComplete = step.status === 'complete'
  const isPast = isComplete
  const isFuture = !isComplete && !isCurrent

  return (
    <div className={`rounded-xl border p-5 transition-all duration-200 ${
      isComplete
        ? 'bg-green-500/5 border-green-500/15'
        : isCurrent
          ? 'bg-surface-800 border-brand-500/30 ring-1 ring-brand-500/10'
          : 'bg-surface-800/50 border-zinc-800/50 opacity-60'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
          isComplete
            ? 'bg-green-500 text-white'
            : isCurrent
              ? 'bg-brand-500 text-white'
              : 'bg-zinc-700 text-zinc-500'
        }`}>
          {isComplete ? (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            number
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`text-sm font-semibold ${isComplete || isCurrent ? 'text-white' : 'text-zinc-500'}`}>
              {step.title}
            </h3>
            {isComplete && <span className="text-xs text-green-400 font-medium">Done</span>}
            {isCurrent && <span className="text-xs text-brand-400 font-medium">Next step</span>}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">{step.description}</p>
          {(isComplete || isCurrent) && children}
          {isFuture && (
            <p className="text-xs text-zinc-600 mt-2 italic">Complete the steps above first</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-brand-400 shrink-0" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function CheckCircle() {
  return (
    <svg className="h-4 w-4 text-green-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}
