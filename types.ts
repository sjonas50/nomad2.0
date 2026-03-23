import type { LookupListRoute } from '@adonisjs/http-server/types'

declare module '@adonisjs/http-server/types' {
  interface RoutesList {
    GET: { [name: string]: LookupListRoute }
    POST: { [name: string]: LookupListRoute }
    PUT: { [name: string]: LookupListRoute }
    PATCH: { [name: string]: LookupListRoute }
    DELETE: { [name: string]: LookupListRoute }
  }
}

declare module '@adonisjs/inertia/types' {
  interface InertiaPages {
    'auth/login': Record<string, never>
    'auth/setup': Record<string, never>
    'home': Record<string, never>
  }
}
