import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Rate limiter using in-memory token bucket per user.
 * Limits chat API to prevent abuse on shared devices.
 */
const rateLimitBuckets = new Map<string, { tokens: number; lastRefill: number }>()
const CLEANUP_INTERVAL_MS = 5 * 60_000 // 5 minutes
const STALE_THRESHOLD_MS = 10 * 60_000 // 10 minutes
let lastCleanup = Date.now()

const RATE_LIMITS: Record<string, { maxTokens: number; refillRate: number; windowMs: number }> = {
  '/api/chat': { maxTokens: 10, refillRate: 1, windowMs: 60_000 }, // 10 req/min, refill 1/min
  '/api/knowledge/upload': { maxTokens: 5, refillRate: 1, windowMs: 60_000 },
  '/api/library/download': { maxTokens: 3, refillRate: 1, windowMs: 60_000 },
}

// SSRF protection: block internal network ranges in user-supplied URLs
const BLOCKED_HOSTS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^\[::1\]/,
  /^\[fc/i,
  /^\[fd/i,
]

// Allowed upload MIME types
const ALLOWED_UPLOAD_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/html',
  'text/csv',
  'text/markdown',
  'application/json',
])

const MAX_UPLOAD_SIZE = 100 * 1024 * 1024 // 100 MB

export default class SecurityMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { request, response } = ctx

    // 1. CSP headers
    response.header(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
        "style-src 'self' 'unsafe-inline' https://fonts.bunny.net",
        "img-src 'self' data: blob: https://tile.openstreetmap.org",
        "connect-src 'self' https://tile.openstreetmap.org https://cdn.protomaps.com https://build.protomaps.com ws://localhost:* ws://127.0.0.1:*",
        "font-src 'self' https://cdn.protomaps.com https://fonts.bunny.net",
        "worker-src 'self' blob:",
        "child-src 'self' blob:",
        "frame-ancestors 'none'",
      ].join('; ')
    )
    response.header('X-Content-Type-Options', 'nosniff')
    response.header('X-Frame-Options', 'DENY')
    response.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.header('X-XSS-Protection', '0') // Modern CSP replaces this

    // 2. Periodic cleanup of stale rate limit buckets
    const now = Date.now()
    if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
      lastCleanup = now
      for (const [key, bucket] of rateLimitBuckets) {
        if (now - bucket.lastRefill > STALE_THRESHOLD_MS) {
          rateLimitBuckets.delete(key)
        }
      }
    }

    // 3. Rate limiting on specific endpoints
    const rateLimitConfig = RATE_LIMITS[request.url()]
    if (rateLimitConfig) {
      const key = `${ctx.auth?.user?.id || request.ip()}_${request.url()}`
      const now = Date.now()
      let bucket = rateLimitBuckets.get(key)

      if (!bucket) {
        bucket = { tokens: rateLimitConfig.maxTokens, lastRefill: now }
        rateLimitBuckets.set(key, bucket)
      }

      // Refill tokens
      const elapsed = now - bucket.lastRefill
      const refill = Math.floor(elapsed / rateLimitConfig.windowMs) * rateLimitConfig.refillRate
      if (refill > 0) {
        bucket.tokens = Math.min(rateLimitConfig.maxTokens, bucket.tokens + refill)
        bucket.lastRefill = now
      }

      if (bucket.tokens <= 0) {
        return response.tooManyRequests({
          error: 'Rate limit exceeded. Please wait before retrying.',
        })
      }

      bucket.tokens--
      response.header('X-RateLimit-Remaining', String(bucket.tokens))
    }

    // 4. File upload restrictions
    if (request.url().includes('/upload')) {
      const contentLength = Number(request.header('content-length') || 0)
      if (contentLength > MAX_UPLOAD_SIZE) {
        return response.requestEntityTooLarge({
          error: `File too large. Maximum size is ${MAX_UPLOAD_SIZE / 1024 / 1024} MB.`,
        })
      }

      const contentType = request.header('content-type') || ''
      if (contentType && !contentType.includes('multipart/form-data')) {
        const mimeType = contentType.split(';')[0].trim()
        if (mimeType && !SecurityMiddleware.isAllowedUploadType(mimeType)) {
          return response.unsupportedMediaType({
            error: `Unsupported file type: ${mimeType}`,
          })
        }
      }
    }

    return next()
  }

  /**
   * Validate a URL is not targeting internal networks (SSRF protection).
   */
  static isUrlSafe(url: string): boolean {
    try {
      const parsed = new URL(url)
      const hostname = parsed.hostname
      return !BLOCKED_HOSTS.some((pattern) => pattern.test(hostname))
    } catch {
      return false
    }
  }

  /**
   * Check if a MIME type is allowed for upload.
   */
  static isAllowedUploadType(mimeType: string): boolean {
    return ALLOWED_UPLOAD_TYPES.has(mimeType)
  }
}
