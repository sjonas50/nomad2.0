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
const MeshController = () => import('#controllers/mesh_controller')
const WifiController = () => import('#controllers/wifi_controller')
const AdminController = () => import('#controllers/admin_controller')
const FeedbackController = () => import('#controllers/feedback_controller')
const IncidentController = () => import('#controllers/incident_controller')
const VoiceController = () => import('#controllers/voice_controller')
const SyncController = () => import('#controllers/sync_controller')
const MapController = () => import('#controllers/map_controller')
const CotController = () => import('#controllers/cot_controller')
const OnboardingController = () => import('#controllers/onboarding_controller')

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
    router.get('/mesh', [MeshController, 'index']).as('mesh')
    router.get('/wifi', [WifiController, 'index']).as('wifi')
    router.get('/admin', [AdminController, 'index']).as('admin')
    router.get('/incidents', [IncidentController, 'index']).as('incidents')
    router.get('/incidents/:id', [IncidentController, 'show']).as('incidents.show')
    router.get('/map', [MapController, 'index']).as('map')
    router.get('/getting-started', [OnboardingController, 'index']).as('onboarding')
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
    router.post('/library/:id/ingest', [LibraryController, 'ingest']).use(middleware.auth())
    router.get('/library/:id/read', [LibraryController, 'read']).use(middleware.auth())
    router.get('/library/:id/zim/search', [LibraryController, 'zimSearch']).use(middleware.auth())
    router.get('/library/:id/zim/article', [LibraryController, 'zimArticle']).use(middleware.auth())
    router.delete('/library/:id', [LibraryController, 'destroy']).use(middleware.auth())

    // Docker services API
    router.post('/services/:id/start', [ServicesController, 'start']).use(middleware.auth())
    router.post('/services/:id/stop', [ServicesController, 'stop']).use(middleware.auth())
    router.post('/services/:id/restart', [ServicesController, 'restart']).use(middleware.auth())
    router.get('/services/:id/logs', [ServicesController, 'logs']).use(middleware.auth())

    // Model management API
    router.get('/models', [ServicesController, 'listModels']).use(middleware.auth())
    router.post('/models/pull', [ServicesController, 'pullModel']).use(middleware.auth())
    router.delete('/models/:name', [ServicesController, 'deleteModel']).use(middleware.auth())
    router.post('/models/assign', [ServicesController, 'assignRole']).use(middleware.auth())

    // Mesh API
    router.get('/mesh/messages', [MeshController, 'messages']).use(middleware.auth())
    router.get('/mesh/nodes', [MeshController, 'nodes']).use(middleware.auth())
    router.get('/mesh/summary', [MeshController, 'summary']).use(middleware.auth())
    router.post('/mesh/embed', [MeshController, 'embed']).use(middleware.auth())

    // WiFi AP API
    router.get('/wifi/status', [WifiController, 'status']).use(middleware.auth())
    router.post('/wifi/start', [WifiController, 'start']).use(middleware.auth())
    router.post('/wifi/stop', [WifiController, 'stop']).use(middleware.auth())

    // Feedback API
    router.post('/feedback', [FeedbackController, 'create']).use(middleware.auth())

    // Incident API
    router.post('/incidents', [IncidentController, 'create']).use(middleware.auth())
    router.patch('/incidents/:id/status', [IncidentController, 'updateStatus']).use(middleware.auth())
    router.post('/incidents/:id/activity', [IncidentController, 'logActivity']).use(middleware.auth())
    router.post('/incidents/:id/check-in', [IncidentController, 'checkIn']).use(middleware.auth())
    router.get('/incidents/:id/summary', [IncidentController, 'summary']).use(middleware.auth())
    router.get('/incidents/:id/aar', [IncidentController, 'aar']).use(middleware.auth())
    router.post('/incidents/:id/functions', [IncidentController, 'createFunction']).use(middleware.auth())
    router.patch('/incidents/functions/:id', [IncidentController, 'updateFunction']).use(middleware.auth())

    // Voice API
    router.post('/voice/capture', [VoiceController, 'capture']).use(middleware.auth())
    router.post('/voice/transcribe', [VoiceController, 'transcribe']).use(middleware.auth())
    router.post('/voice/extract', [VoiceController, 'extract']).use(middleware.auth())

    // Map & Position API
    router.get('/map/markers', [MapController, 'markers']).use(middleware.auth())
    router.get('/map/geofences', [MapController, 'geofences']).use(middleware.auth())
    router.post('/map/geofences', [MapController, 'createGeofence']).use(middleware.auth())
    router.post('/map/position', [MapController, 'updatePosition']).use(middleware.auth())
    router.get('/map/tiles/:filename', [MapController, 'serveTile']).use(middleware.auth())
    router.post('/map/tiles/upload', [MapController, 'uploadTiles']).use(middleware.auth())
    router.delete('/map/tiles/:filename', [MapController, 'deleteTiles']).use(middleware.auth())
    router.get('/map/regions', [MapController, 'regions']).use(middleware.auth())
    router.post('/map/extract', [MapController, 'extractRegion']).use(middleware.auth())
    router.get('/map/extract/:regionId', [MapController, 'extractStatus']).use(middleware.auth())
    router.delete('/map/regions/:regionId', [MapController, 'deleteRegion']).use(middleware.auth())

    // CoT / TAK API
    router.post('/cot/send', [CotController, 'send']).use(middleware.auth())
    router.post('/cot/broadcast-markers', [CotController, 'broadcastMarkers']).use(middleware.auth())
    router.get('/cot/status', [CotController, 'status']).use(middleware.auth())

    // Sync & Sneakernet API
    router.get('/sync/status', [SyncController, 'status']).use(middleware.auth())
    router.get('/sync/peers', [SyncController, 'peers']).use(middleware.auth())
    router.post('/sync/export', [SyncController, 'exportBundle']).use(middleware.auth())
    router.post('/sync/import', [SyncController, 'importBundle']).use(middleware.auth())
    router.get('/sync/bundles', [SyncController, 'listBundles']).use(middleware.auth())
    router.delete('/sync/bundles/:filename', [SyncController, 'deleteBundle']).use(middleware.auth())
    router.get('/sync/download/:filename', [SyncController, 'downloadBundle']).use(middleware.auth())

    // Onboarding API
    router.get('/onboarding/status', [OnboardingController, 'status']).use(middleware.auth())
    router.post('/onboarding/pull-model', [OnboardingController, 'pullModel']).use(middleware.auth())
    router.post('/onboarding/dismiss', [OnboardingController, 'dismiss']).use(middleware.auth())
    router.post('/onboarding/toggle-service', [OnboardingController, 'toggleService']).use(middleware.auth())

    // Admin API (auth required, admin role checked in controller)
    router.get('/admin/users', [AdminController, 'listUsers']).use(middleware.auth())
    router.post('/admin/users', [AdminController, 'createUser']).use(middleware.auth())
    router.patch('/admin/users/:id', [AdminController, 'updateUser']).use(middleware.auth())
    router.delete('/admin/users/:id', [AdminController, 'deleteUser']).use(middleware.auth())
    router.get('/admin/audit-logs', [AdminController, 'auditLogs']).use(middleware.auth())
    router.get('/admin/templates', [AdminController, 'listTemplates']).use(middleware.auth())
    router.put('/admin/templates/:slug', [AdminController, 'updateTemplate']).use(middleware.auth())
    router.get('/admin/backups', [AdminController, 'listBackups']).use(middleware.auth())
    router.post('/admin/backup', [AdminController, 'createBackup']).use(middleware.auth())
    router.post('/admin/restore', [AdminController, 'restoreBackup']).use(middleware.auth())
    router.delete('/admin/backups/:filename', [AdminController, 'deleteBackup']).use(middleware.auth())
    router.get('/admin/health', [AdminController, 'health']).use(middleware.auth())
    router.get('/admin/feedback/stats', [FeedbackController, 'stats']).use(middleware.auth())
  })
  .prefix('/api')
