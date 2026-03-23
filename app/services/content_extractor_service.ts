import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { extractText as extractPdfText } from 'unpdf'

interface ExtractionResult {
  text: string
  metadata: {
    fileType: string
    pageCount?: number
    wordCount: number
    charCount: number
  }
}

const SUPPORTED_EXTENSIONS: Record<string, string> = {
  '.pdf': 'pdf',
  '.txt': 'text',
  '.md': 'markdown',
  '.html': 'html',
  '.htm': 'html',
  '.csv': 'csv',
}

const MIME_TYPE_MAP: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/plain': 'text',
  'text/markdown': 'markdown',
  'text/html': 'html',
  'text/csv': 'csv',
}

export default class ContentExtractorService {
  /**
   * Extract text content from a file on disk.
   */
  async extract(filePath: string): Promise<ExtractionResult> {
    const fileName = filePath.split('/').pop() ?? filePath
    const fileType = this.detectFileType(fileName)
    const buffer = await readFile(filePath)

    if (fileType === 'pdf') {
      return this.extractPdf(buffer)
    }

    const content = buffer.toString('utf-8')
    return this.extractText(content, fileType)
  }

  /**
   * Extract text content from an in-memory buffer.
   */
  async extractFromBuffer(buffer: Buffer, fileName: string): Promise<ExtractionResult> {
    const fileType = this.detectFileType(fileName)

    if (fileType === 'pdf') {
      return this.extractPdf(buffer)
    }

    const content = buffer.toString('utf-8')
    return this.extractText(content, fileType)
  }

  /**
   * Extract text from a PDF buffer using unpdf.
   */
  private async extractPdf(buffer: Buffer): Promise<ExtractionResult> {
    const { text, totalPages } = await extractPdfText(new Uint8Array(buffer), {
      mergePages: true,
    })

    const cleanedText = (text as unknown as string).trim()

    return {
      text: cleanedText,
      metadata: {
        fileType: 'pdf',
        pageCount: totalPages,
        wordCount: this.countWords(cleanedText),
        charCount: cleanedText.length,
      },
    }
  }

  /**
   * Build an ExtractionResult from raw string content.
   */
  private extractText(content: string, fileType: string): ExtractionResult {
    const text = fileType === 'html' ? this.stripHtml(content) : content.trim()

    return {
      text,
      metadata: {
        fileType,
        wordCount: this.countWords(text),
        charCount: text.length,
      },
    }
  }

  /**
   * Strip HTML tags and decode common entities to produce plain text.
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Detect file type from the file name extension.
   * Throws if the type is unsupported.
   */
  private detectFileType(fileName: string): string {
    const ext = extname(fileName).toLowerCase()
    const fileType = SUPPORTED_EXTENSIONS[ext]

    if (fileType) {
      return fileType
    }

    const supported = Object.keys(SUPPORTED_EXTENSIONS).join(', ')
    throw new Error(
      `Unsupported file type "${ext || '(none)'}". Supported extensions: ${supported}`
    )
  }

  /**
   * Resolve a MIME type string to an internal file type key.
   * Returns undefined if the MIME type is not recognized.
   */
  detectFileTypeFromMime(mimeType: string): string | undefined {
    return MIME_TYPE_MAP[mimeType]
  }

  private countWords(text: string): number {
    if (!text) return 0
    return text.split(/\s+/).filter(Boolean).length
  }
}
