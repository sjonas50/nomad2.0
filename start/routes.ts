/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const AuthController = () => import('#controllers/auth_controller')
const StreamTestController = () => import('#controllers/stream_test_controller')
const ChatController = () => import('#controllers/chat_controller')

// Auth routes
router.get('/login', [AuthController, 'show']).use(middleware.guest()).as('auth.login')
router.post('/login', [AuthController, 'login']).use(middleware.guest()).as('auth.login.store')
router.post('/logout', [AuthController, 'logout']).use(middleware.auth()).as('auth.logout')
router.get('/setup', [AuthController, 'showSetup']).as('auth.setup')
router.post('/setup', [AuthController, 'setup']).as('auth.setup.store')

// Authenticated routes
router
  .group(() => {
    router.on('/').renderInertia('home', {}).as('home')
  })
  .use(middleware.auth())

// API routes (for streaming — bypasses Inertia)
router
  .group(() => {
    router.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))
    router.get('/stream-test', [StreamTestController, 'stream'])

    // Chat API
    router.post('/chat', [ChatController, 'stream']).use(middleware.auth())
    router.get('/sessions', [ChatController, 'sessions']).use(middleware.auth())
    router.get('/sessions/:id/messages', [ChatController, 'messages']).use(middleware.auth())
    router.delete('/sessions/:id', [ChatController, 'deleteSession']).use(middleware.auth())
  })
  .prefix('/api')
