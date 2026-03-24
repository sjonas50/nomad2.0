/**
 * Target ~1200 tokens per chunk. At 3 chars/token → 3600 chars.
 * Leaves headroom under the 4000-char embedding ceiling.
 */
const DEFAULT_CHUNK_SIZE = 1200
const DEFAULT_OVERLAP = 100
const CHARS_PER_TOKEN = 3

interface Chunk {
  text: string
  index: number
  metadata: {
    startChar: number
    endChar: number
    estimatedTokens: number
    heading?: string
  }
}

interface ChunkingOptions {
  chunkSize?: number
  overlap?: number
  preserveHeadings?: boolean
}

export default class ChunkingService {
  /**
   * Token-based chunking with overlap.
   * Uses char-based estimation (~4 chars/token) to target token limits.
   */
  chunkText(text: string, options: ChunkingOptions = {}): Chunk[] {
    const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE
    const overlap = options.overlap ?? DEFAULT_OVERLAP
    const chunkChars = chunkSize * CHARS_PER_TOKEN
    const overlapChars = overlap * CHARS_PER_TOKEN

    if (text.length <= chunkChars) {
      return [
        {
          text: text.trim(),
          index: 0,
          metadata: {
            startChar: 0,
            endChar: text.length,
            estimatedTokens: Math.ceil(text.length / CHARS_PER_TOKEN),
          },
        },
      ]
    }

    const chunks: Chunk[] = []
    let start = 0
    let index = 0

    while (start < text.length) {
      let end = Math.min(start + chunkChars, text.length)

      // Try to break at sentence boundary
      if (end < text.length) {
        const searchWindow = text.slice(Math.max(end - 200, start), end)
        const lastSentenceEnd = Math.max(
          searchWindow.lastIndexOf('. '),
          searchWindow.lastIndexOf('.\n'),
          searchWindow.lastIndexOf('? '),
          searchWindow.lastIndexOf('! ')
        )
        if (lastSentenceEnd > 0) {
          end = Math.max(end - 200, start) + lastSentenceEnd + 1
        }
      }

      const chunkText = text.slice(start, end).trim()
      if (chunkText.length > 0) {
        chunks.push({
          text: chunkText,
          index,
          metadata: {
            startChar: start,
            endChar: end,
            estimatedTokens: Math.ceil(chunkText.length / CHARS_PER_TOKEN),
          },
        })
        index++
      }

      start = end - overlapChars
      if (start >= text.length) break
      if (end === text.length) break
    }

    return chunks
  }

  /**
   * Heading-aware chunking: splits on markdown headings first,
   * then applies token-based chunking within each section.
   * Preserves heading context in chunk metadata.
   */
  chunkStructured(text: string, options: ChunkingOptions = {}): Chunk[] {
    const sections = this.splitByHeadings(text)
    const allChunks: Chunk[] = []
    let globalIndex = 0

    for (const section of sections) {
      const chunks = this.chunkText(section.content, options)
      for (const chunk of chunks) {
        allChunks.push({
          ...chunk,
          index: globalIndex++,
          metadata: {
            ...chunk.metadata,
            heading: section.heading || undefined,
            startChar: section.startChar + chunk.metadata.startChar,
            endChar: section.startChar + chunk.metadata.endChar,
          },
        })
      }
    }

    return allChunks
  }

  private splitByHeadings(
    text: string
  ): Array<{ heading: string; content: string; startChar: number }> {
    const headingPattern = /^(#{1,6})\s+(.+)$/gm
    const sections: Array<{ heading: string; content: string; startChar: number }> = []
    let lastIndex = 0
    let lastHeading = ''
    let match: RegExpExecArray | null

    match = headingPattern.exec(text)
    while (match !== null) {
      if (match.index > lastIndex) {
        const content = text.slice(lastIndex, match.index).trim()
        if (content.length > 0) {
          sections.push({ heading: lastHeading, content, startChar: lastIndex })
        }
      }
      lastHeading = match[2]
      lastIndex = match.index
      match = headingPattern.exec(text)
    }

    // Remaining text
    if (lastIndex < text.length) {
      const content = text.slice(lastIndex).trim()
      if (content.length > 0) {
        sections.push({ heading: lastHeading, content, startChar: lastIndex })
      }
    }

    // If no headings found, return whole text as one section
    if (sections.length === 0) {
      sections.push({ heading: '', content: text, startChar: 0 })
    }

    return sections
  }
}
