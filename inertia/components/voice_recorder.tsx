import { useState, useRef, useCallback } from 'react'
import { apiFetch } from '~/lib/fetch'

interface ExtractedActivity {
  activity: string
  actor: string | null
  category: string
  resourcesMentioned: string[]
  incidentRef: string | null
  confidence: number
}

interface TranscriptionResult {
  text: string
  segments: Array<{ start: number; end: number; text: string }>
  language: string
}

interface CaptureResult {
  transcription: TranscriptionResult
  extracted: ExtractedActivity
  logId: number | null
  incidentId: number | null
}

interface VoiceRecorderProps {
  incidentId?: number
  onCapture?: (result: CaptureResult) => void
  compact?: boolean
}

type RecordingState = 'idle' | 'recording' | 'processing'

export default function VoiceRecorder({ onCapture, compact = false }: VoiceRecorderProps) {
  const [state, setState] = useState<RecordingState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CaptureResult | null>(null)
  const [duration, setDuration] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startRecording = useCallback(async () => {
    setError(null)
    setResult(null)
    setDuration(0)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        if (timerRef.current) clearInterval(timerRef.current)

        const blob = new Blob(chunksRef.current, { type: mimeType })
        await uploadAndProcess(blob)
      }

      mediaRecorderRef.current = recorder
      recorder.start(1000)
      setState('recording')

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1)
      }, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied')
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
      setState('processing')
    }
  }, [])

  const uploadAndProcess = async (blob: Blob) => {
    setState('processing')
    try {
      const formData = new FormData()
      formData.append('audio', blob, 'recording.webm')

      const response = await apiFetch('/api/voice/capture', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(data.error || `HTTP ${response.status}`)
      }

      const data: CaptureResult = await response.json()
      setResult(data)
      onCapture?.(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed')
    } finally {
      setState('idle')
    }
  }

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {state === 'idle' && (
          <button
            onClick={startRecording}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 transition-colors"
            title="Record voice note"
          >
            <MicIcon className="h-3.5 w-3.5" />
            Voice
          </button>
        )}
        {state === 'recording' && (
          <>
            <span className="animate-pulse text-sm text-red-400 font-medium">{formatDuration(duration)}</span>
            <button
              onClick={stopRecording}
              className="rounded-lg bg-zinc-700 px-3 py-1.5 text-sm text-white hover:bg-zinc-600 transition-colors"
            >
              Stop
            </button>
          </>
        )}
        {state === 'processing' && (
          <span className="text-sm text-zinc-500">Transcribing...</span>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-surface-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-zinc-200">Voice Capture</h4>
        {state === 'recording' && (
          <span className="animate-pulse rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-medium text-red-400 ring-1 ring-red-500/30">
            Recording {formatDuration(duration)}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        {state === 'idle' && (
          <button
            onClick={startRecording}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 font-medium transition-colors"
          >
            <MicIcon className="h-4 w-4" />
            Start Recording
          </button>
        )}
        {state === 'recording' && (
          <button
            onClick={stopRecording}
            className="flex items-center gap-2 rounded-lg bg-zinc-700 px-4 py-2 text-sm text-white hover:bg-zinc-600 font-medium transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            Stop & Process
          </button>
        )}
        {state === 'processing' && (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4m-3.93 7.07l-2.83-2.83M6.34 6.34L3.51 3.51" />
            </svg>
            Transcribing and extracting...
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">{error}</div>
      )}

      {result && (
        <div className="space-y-2 border-t border-zinc-700 pt-3">
          <div>
            <span className="text-xs font-medium text-zinc-500">Transcript:</span>
            <p className="text-sm text-zinc-200">{result.transcription.text}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-brand-400 ring-1 ring-brand-500/30 font-medium">
              {result.extracted.category}
            </span>
            {result.extracted.confidence > 0 && (
              <span className="rounded-full bg-zinc-500/15 px-2 py-0.5 text-zinc-400 ring-1 ring-zinc-500/30">
                {Math.round(result.extracted.confidence * 100)}% confidence
              </span>
            )}
            {result.logId && (
              <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-green-400 ring-1 ring-green-500/30">
                Logged #{result.logId}
              </span>
            )}
          </div>
          {result.extracted.activity !== result.transcription.text && (
            <div>
              <span className="text-xs font-medium text-zinc-500">Extracted Activity:</span>
              <p className="text-sm text-zinc-200">{result.extracted.activity}</p>
            </div>
          )}
          {result.extracted.resourcesMentioned.length > 0 && (
            <div className="text-xs text-zinc-500">
              Resources: {result.extracted.resourcesMentioned.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
  )
}
