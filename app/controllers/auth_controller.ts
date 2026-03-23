import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import { loginValidator, setupValidator } from '#validators/auth'

export default class AuthController {
  async show({ inertia }: HttpContext) {
    return inertia.render('auth/login', {})
  }

  async login({ request, auth, response, session }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)

    try {
      const user = await User.verifyCredentials(email, password)
      await auth.use('web').login(user)
      // @ts-expect-error — RoutesList not augmented; toRoute works at runtime
      return response.redirect().toRoute('home')
    } catch {
      session.flash('errors', { login: 'Invalid email or password' })
      return response.redirect().back()
    }
  }

  async logout({ auth, response }: HttpContext) {
    await auth.use('web').logout()
    // @ts-expect-error — RoutesList not augmented; toRoute works at runtime
    return response.redirect().toRoute('auth.login')
  }

  async showSetup({ inertia }: HttpContext) {
    const userCount = await User.query().count('* as total').first()
    const total = Number(userCount?.$extras.total ?? 0)

    if (total > 0) {
      return inertia.render('auth/login', {})
    }

    return inertia.render('auth/setup', {})
  }

  async setup({ request, auth, response }: HttpContext) {
    const userCount = await User.query().count('* as total').first()
    const total = Number(userCount?.$extras.total ?? 0)

    if (total > 0) {
      // @ts-expect-error — RoutesList not augmented; toRoute works at runtime
      return response.redirect().toRoute('auth.login')
    }

    const data = await request.validateUsing(setupValidator)
    const user = await User.create({
      ...data,
      role: 'admin',
    })

    await auth.use('web').login(user)
    // @ts-expect-error — RoutesList not augmented; toRoute works at runtime
    return response.redirect().toRoute('home')
  }
}
