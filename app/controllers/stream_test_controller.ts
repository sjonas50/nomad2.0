import type { HttpContext } from '@adonisjs/core/http'

/**
 * Proof-of-concept: AdonisJS controller returning a ReadableStream.
 * Validates that LLM token-by-token streaming works without Inertia/Transmit.
 */
export default class StreamTestController {
  async stream({ response }: HttpContext) {
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        const words = ['Hello', ' from', ' The', ' Attic', ' AI', '!', ' Streaming', ' works', '.']

        for (const word of words) {
          const chunk = JSON.stringify({ token: word, done: false }) + '\n'
          controller.enqueue(encoder.encode(chunk))
          await new Promise((resolve) => setTimeout(resolve, 100))
        }

        controller.enqueue(encoder.encode(JSON.stringify({ token: '', done: true }) + '\n'))
        controller.close()
      },
    })

    response.header('Content-Type', 'application/x-ndjson')
    response.header('Cache-Control', 'no-cache')
    response.header('Connection', 'keep-alive')

    return response.stream(stream)
  }
}
