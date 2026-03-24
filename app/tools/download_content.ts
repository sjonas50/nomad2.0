import type { ToolHandler, ToolExecutionContext, ToolResult } from '#services/tool_registry'
import DownloadService from '#services/download_service'
import SecurityMiddleware from '#middleware/security_middleware'
import { randomUUID } from 'node:crypto'

const downloadContent: ToolHandler = {
  name: 'download_content',
  displayName: 'Download Content',
  description: 'Download a content file (ZIM, map, etc.) from a URL to the local library',
  category: 'content',
  parameters: [
    { name: 'url', type: 'string', description: 'URL to download from', required: true },
    { name: 'name', type: 'string', description: 'Display name for the content', required: true },
  ],
  minimumRole: 'operator',
  requiresConfirmation: true,

  async execute(params: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const url = params.url as string
    const name = params.name as string
    const id = randomUUID()

    if (!SecurityMiddleware.isUrlSafe(url)) {
      return {
        success: false,
        message: 'URL targets a blocked network range (SSRF protection)',
      }
    }

    try {
      const downloadService = new DownloadService()
      const destDir = process.env.ZIM_STORAGE_DIR || '/tmp/attic-downloads'
      const fileName = url.split('/').pop() || `${id}.bin`

      // Fire and forget — download runs in background
      downloadService.download({ id, url, destDir, fileName }).catch(() => {
        // Download errors are tracked internally
      })

      return {
        success: true,
        message: `Started downloading "${name}". Download ID: ${id}`,
        data: { downloadId: id, url, name },
      }
    } catch (error) {
      return {
        success: false,
        message: `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  },
}

export default downloadContent
