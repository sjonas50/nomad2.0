import OllamaService from '#services/ollama_service'
import EmbeddingService from '#services/embedding_service'
import VectorStoreService from '#services/vector_store_service'
export interface BenchmarkResult {
  name: string
  metric: string
  value: number
  unit: string
  target?: number
  passed: boolean
}

export interface BenchmarkReport {
  timestamp: string
  results: BenchmarkResult[]
  summary: { passed: number; failed: number; total: number }
}

const TARGETS = {
  embeddingLatencyMs: 500, // Single text embedding
  embeddingThroughput: 50, // Texts per minute
  searchLatencyMs: 200, // Vector search
  generationTtftMs: 2000, // Time to first token
  ollamaHealthMs: 1000, // Health check response
}

export default class BenchmarkService {
  private ollama: OllamaService
  private embedding: EmbeddingService
  private vectorStore: VectorStoreService

  constructor() {
    this.ollama = new OllamaService()
    this.embedding = new EmbeddingService(this.ollama)
    this.vectorStore = new VectorStoreService()
  }

  async runAll(): Promise<BenchmarkReport> {
    const results: BenchmarkResult[] = []

    results.push(await this.benchmarkOllamaHealth())
    results.push(await this.benchmarkEmbeddingLatency())
    results.push(await this.benchmarkEmbeddingThroughput())
    results.push(await this.benchmarkSearchLatency())
    results.push(await this.benchmarkGenerationTtft())

    const passed = results.filter((r) => r.passed).length
    return {
      timestamp: new Date().toISOString(),
      results,
      summary: { passed, failed: results.length - passed, total: results.length },
    }
  }

  private async benchmarkOllamaHealth(): Promise<BenchmarkResult> {
    const start = Date.now()
    try {
      const available = await this.ollama.isAvailable()
      const ms = Date.now() - start
      return {
        name: 'Ollama Health',
        metric: 'response_time',
        value: ms,
        unit: 'ms',
        target: TARGETS.ollamaHealthMs,
        passed: available && ms < TARGETS.ollamaHealthMs,
      }
    } catch {
      return {
        name: 'Ollama Health',
        metric: 'response_time',
        value: Date.now() - start,
        unit: 'ms',
        target: TARGETS.ollamaHealthMs,
        passed: false,
      }
    }
  }

  private async benchmarkEmbeddingLatency(): Promise<BenchmarkResult> {
    const start = Date.now()
    try {
      await this.embedding.embedQuery('benchmark test query for latency measurement')
      const ms = Date.now() - start
      return {
        name: 'Embedding Latency',
        metric: 'single_embed',
        value: ms,
        unit: 'ms',
        target: TARGETS.embeddingLatencyMs,
        passed: ms < TARGETS.embeddingLatencyMs,
      }
    } catch {
      return {
        name: 'Embedding Latency',
        metric: 'single_embed',
        value: Date.now() - start,
        unit: 'ms',
        target: TARGETS.embeddingLatencyMs,
        passed: false,
      }
    }
  }

  private async benchmarkEmbeddingThroughput(): Promise<BenchmarkResult> {
    const texts = Array.from({ length: 10 }, (_, i) =>
      `Benchmark document ${i}: This is a test passage for measuring embedding throughput performance.`
    )

    const start = Date.now()
    try {
      await this.embedding.embedDocuments(texts)
      const elapsed = Date.now() - start
      const perMinute = Math.round((texts.length / elapsed) * 60000)
      return {
        name: 'Embedding Throughput',
        metric: 'texts_per_minute',
        value: perMinute,
        unit: 'texts/min',
        target: TARGETS.embeddingThroughput,
        passed: perMinute >= TARGETS.embeddingThroughput,
      }
    } catch {
      return {
        name: 'Embedding Throughput',
        metric: 'texts_per_minute',
        value: 0,
        unit: 'texts/min',
        target: TARGETS.embeddingThroughput,
        passed: false,
      }
    }
  }

  private async benchmarkSearchLatency(): Promise<BenchmarkResult> {
    const start = Date.now()
    try {
      const queryVec = await this.embedding.embedQuery('benchmark search query')
      const searchStart = Date.now()
      await this.vectorStore.search(queryVec, undefined, 5)
      const searchMs = Date.now() - searchStart
      return {
        name: 'Search Latency',
        metric: 'vector_search',
        value: searchMs,
        unit: 'ms',
        target: TARGETS.searchLatencyMs,
        passed: searchMs < TARGETS.searchLatencyMs,
      }
    } catch {
      return {
        name: 'Search Latency',
        metric: 'vector_search',
        value: Date.now() - start,
        unit: 'ms',
        target: TARGETS.searchLatencyMs,
        passed: false,
      }
    }
  }

  private async benchmarkGenerationTtft(): Promise<BenchmarkResult> {
    const start = Date.now()
    try {
      const stream = this.ollama.chatStream(
        'qwen2.5:1.5b',
        [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Say hello in one word.' },
        ],
        { numCtx: 512 }
      )

      // Measure time to first token
      const firstChunk = await stream.next()
      const ttft = Date.now() - start

      // Consume the rest
      if (!firstChunk.done) {
        for await (const _ of stream) { /* drain */ }
      }

      return {
        name: 'Generation TTFT',
        metric: 'time_to_first_token',
        value: ttft,
        unit: 'ms',
        target: TARGETS.generationTtftMs,
        passed: ttft < TARGETS.generationTtftMs,
      }
    } catch {
      return {
        name: 'Generation TTFT',
        metric: 'time_to_first_token',
        value: Date.now() - start,
        unit: 'ms',
        target: TARGETS.generationTtftMs,
        passed: false,
      }
    }
  }
}
