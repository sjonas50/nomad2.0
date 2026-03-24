/**
 * CSRF-aware fetch wrapper. Automatically includes the XSRF-TOKEN
 * cookie as a header for mutating requests (POST, PUT, PATCH, DELETE).
 */
function csrfToken(): string {
  const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const needsCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)

  if (needsCsrf) {
    const headers = new Headers(init?.headers)
    if (!headers.has('X-XSRF-TOKEN')) {
      headers.set('X-XSRF-TOKEN', csrfToken())
    }
    return fetch(input, { ...init, headers })
  }

  return fetch(input, init)
}
