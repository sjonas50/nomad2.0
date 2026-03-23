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
const KnowledgeController = () => import('#controllers/knowledge_controller')
const ServicesController = () => import('#controllers/services_controller')
const LibraryController = () => import('#controllers/library_controller')

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
    router.get('/knowledge', [KnowledgeController, 'index']).as('knowledge')
    router.get('/library', [LibraryController, 'index']).as('library')
    router.get('/services', [ServicesController, 'index']).as('services')
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

    // Knowledge API
    router.post('/knowledge/upload', [KnowledgeController, 'upload']).use(middleware.auth())
    router.post('/knowledge/text', [KnowledgeController, 'uploadText']).use(middleware.auth())
    router.get('/knowledge/:id', [KnowledgeController, 'show']).use(middleware.auth())
    router.post('/knowledge/:id/re-embed', [KnowledgeController, 'reEmbed']).use(middleware.auth())
    router.delete('/knowledge/:id', [KnowledgeController, 'destroy']).use(middleware.auth())

    // Library / Downloads API
    router.post('/library/download', [LibraryController, 'download']).use(middleware.auth())
    router.get('/library/downloads', [LibraryController, 'downloads']).use(middleware.auth())
    router.delete('/library/:id', [LibraryController, 'destroy']).use(middleware.auth())

    // Docker services API
    router.post('/services/:id/start', [ServicesController, 'start']).use(middleware.auth())
    router.post('/services/:id/stop', [ServicesController, 'stop']).use(middleware.auth())
    router.post('/services/:id/restart', [ServicesController, 'restart']).use(middleware.auth())
    router.get('/services/:id/logs', [ServicesController, 'logs']).use(middleware.auth())
  })
  .prefix('/api')
