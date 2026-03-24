import type { HttpContext } from '@adonisjs/core/http'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import User from '#models/user'
import { loginValidator, setupValidator } from '#validators/auth'

export default class AuthController {
  async show({ inertia, response }: HttpContext) {
    const userCount = await User.query().count('* as total').first()
    const total = Number(userCount?.$extras.total ?? 0)

    if (total === 0) {
      return response.redirect('/setup')
    }

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

    const { enableFalkordb, enableSidecar, enableMesh, ...accountData } =
      await request.validateUsing(setupValidator)

    const user = await User.create({
      ...accountData,
      role: 'admin',
    })

    // Persist optional service flags to .env
    await this.persistServiceFlags({
      FALKORDB_ENABLED: enableFalkordb ?? false,
      SIDECAR_ENABLED: enableSidecar ?? false,
      MESH_ENABLED: enableMesh ?? false,
    })

    await auth.use('web').login(user)
    return response.redirect('/getting-started')
  }

  /**
   * Append or update service-enable flags in the .env file and set them
   * on the current process so they take effect immediately.
   */
  private async persistServiceFlags(flags: Record<string, boolean>) {
    const root = dirname(dirname(fileURLToPath(import.meta.url)))
    const envPath = join(root, '.env')

    let envContent: string
    try {
      envContent = await readFile(envPath, 'utf-8')
    } catch {
      envContent = ''
    }

    for (const [key, value] of Object.entries(flags)) {
      const strVal = String(value)
      const regex = new RegExp(`^${key}=.*$`, 'm')
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${strVal}`)
      } else {
        envContent = envContent.trimEnd() + `\n${key}=${strVal}\n`
      }
      // Set on running process so health checks pick it up immediately
      process.env[key] = strVal
    }

    await writeFile(envPath, envContent)
  }
}
