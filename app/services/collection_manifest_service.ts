import logger from '@adonisjs/core/services/logger'

interface ManifestItem {
  id: string
  name: string
  description: string
  url: string
  sizeMb: number
  category: string
  type: 'zim' | 'pmtiles' | 'other'
}

/**
 * Curated list of well-known ZIM and PMTiles content available for download.
 */
const CURATED_MANIFEST: ManifestItem[] = [
  // --- ZIM files (Kiwix) ---
  {
    id: 'wikipedia-en-all',
    name: 'Wikipedia (English, Full)',
    description: 'Complete English Wikipedia with all articles and images.',
    url: 'https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_maxi.zim',
    sizeMb: 97_000,
    category: 'Wikipedia',
    type: 'zim',
  },
  {
    id: 'wikipedia-en-simple',
    name: 'Wikipedia (Simple English)',
    description: 'Simple English Wikipedia — easier language for learners and quick reference.',
    url: 'https://download.kiwix.org/zim/wikipedia/wikipedia_en_simple_all_maxi.zim',
    sizeMb: 780,
    category: 'Wikipedia',
    type: 'zim',
  },
  {
    id: 'wikipedia-es-all',
    name: 'Wikipedia (Spanish, Full)',
    description: 'Complete Spanish Wikipedia with all articles and images.',
    url: 'https://download.kiwix.org/zim/wikipedia/wikipedia_es_all_maxi.zim',
    sizeMb: 24_000,
    category: 'Wikipedia',
    type: 'zim',
  },
  {
    id: 'wikipedia-fr-all',
    name: 'Wikipedia (French, Full)',
    description: 'Complete French Wikipedia with all articles and images.',
    url: 'https://download.kiwix.org/zim/wikipedia/wikipedia_fr_all_maxi.zim',
    sizeMb: 28_000,
    category: 'Wikipedia',
    type: 'zim',
  },
  {
    id: 'wiktionary-en',
    name: 'Wiktionary (English)',
    description: 'English Wiktionary — free dictionary with definitions, pronunciations, and etymologies.',
    url: 'https://download.kiwix.org/zim/wiktionary/wiktionary_en_all_maxi.zim',
    sizeMb: 6_400,
    category: 'Wiktionary',
    type: 'zim',
  },
  {
    id: 'wikivoyage-en',
    name: 'Wikivoyage (English)',
    description: 'Free worldwide travel guide with destination info, itineraries, and tips.',
    url: 'https://download.kiwix.org/zim/wikivoyage/wikivoyage_en_all_maxi.zim',
    sizeMb: 820,
    category: 'Wikivoyage',
    type: 'zim',
  },
  {
    id: 'gutenberg-en',
    name: 'Project Gutenberg (English)',
    description: 'Over 60,000 free public-domain ebooks.',
    url: 'https://download.kiwix.org/zim/gutenberg/gutenberg_en_all.zim',
    sizeMb: 64_000,
    category: 'Gutenberg',
    type: 'zim',
  },

  // --- PMTiles (Protomaps) ---
  {
    id: 'pmtiles-planet',
    name: 'OpenStreetMap Planet',
    description: 'Full planet extract of OpenStreetMap as a single PMTiles archive.',
    url: 'https://build.protomaps.com/20240101.pmtiles',
    sizeMb: 110_000,
    category: 'Maps',
    type: 'pmtiles',
  },
  {
    id: 'pmtiles-north-america',
    name: 'OpenStreetMap North America',
    description: 'North America regional extract from OpenStreetMap.',
    url: 'https://build.protomaps.com/20240101-north-america.pmtiles',
    sizeMb: 18_000,
    category: 'Maps',
    type: 'pmtiles',
  },
  {
    id: 'pmtiles-europe',
    name: 'OpenStreetMap Europe',
    description: 'Europe regional extract from OpenStreetMap.',
    url: 'https://build.protomaps.com/20240101-europe.pmtiles',
    sizeMb: 22_000,
    category: 'Maps',
    type: 'pmtiles',
  },
]

export default class CollectionManifestService {
  /**
   * Return the curated list of available content for download.
   */
  async getAvailableContent(): Promise<ManifestItem[]> {
    logger.info({ count: CURATED_MANIFEST.length }, 'Returning curated content manifest')
    return CURATED_MANIFEST
  }

  /**
   * Return the distinct categories present in the manifest.
   */
  async getCategories(): Promise<string[]> {
    const categories = [...new Set(CURATED_MANIFEST.map((item) => item.category))]
    return categories.sort()
  }
}
