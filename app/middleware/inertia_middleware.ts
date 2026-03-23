import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import BaseInertiaMiddleware from '@adonisjs/inertia/inertia_middleware'
import type User from '#models/user'

export default class InertiaMiddleware extends BaseInertiaMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    await this.init(ctx)
    await next()
    this.dispose(ctx)
  }

  async share(ctx: HttpContext) {
    const user = ctx.auth?.user as User | undefined
    return {
      errors: ctx.session?.flashMessages.get('errors') ?? null,
      auth: {
        user: user
          ? {
              id: user.id,
              fullName: user.fullName,
              email: user.email,
              role: user.role,
            }
          : null,
      },
    }
  }
}
