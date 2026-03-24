import logger from '@adonisjs/core/services/logger'

export interface ManifestItem {
  id: string
  name: string
  description: string
  url: string
  sizeMb: number
  category: string
  type: 'zim' | 'pmtiles' | 'osm.pbf' | 'pdf' | 'other'
  icon?: string
  tags?: string[]
}

export interface ContentPack {
  id: string
  name: string
  description: string
  icon: string
  color: string
  items: string[] // manifest item IDs
}

/**
 * Curated list of all downloadable content.
 * URLs verified against live sources as of 2026-03.
 */
const CURATED_MANIFEST: ManifestItem[] = [
  // ═══════════════════════════════════════
  //  EMERGENCY & SURVIVAL
  // ═══════════════════════════════════════
  {
    id: 'ready-gov',
    name: 'Ready.gov (FEMA)',
    description: 'Complete FEMA emergency preparedness site — disaster plans, checklists, community response.',
    url: 'https://download.kiwix.org/zim/other/www.ready.gov_en_all_2024-12.zim',
    sizeMb: 2_300,
    category: 'Emergency',
    type: 'zim',
    tags: ['fema', 'disaster', 'preparedness'],
  },
  {
    id: 'post-disaster',
    name: 'Post-Disaster Recovery Guide',
    description: 'Comprehensive post-disaster guidance compendium — shelter, water, sanitation, rebuild.',
    url: 'https://download.kiwix.org/zim/other/zimgit-post-disaster_en_2024-05.zim',
    sizeMb: 615,
    category: 'Emergency',
    type: 'zim',
    tags: ['disaster', 'recovery', 'shelter'],
  },
  {
    id: 'army-survival',
    name: 'FM 21-76 Survival Manual',
    description: 'U.S. Army field survival manual — shelter, fire, water, food, navigation, signaling.',
    url: 'https://ia800302.us.archive.org/29/items/Fm21-76SurvivalManual/FM21-76_SurvivalManual.pdf',
    sizeMb: 15,
    category: 'Emergency',
    type: 'pdf',
    tags: ['survival', 'military', 'field-manual'],
  },
  {
    id: 'fema-are-you-ready',
    name: 'FEMA: Are You Ready?',
    description: 'In-depth guide to citizen preparedness — 200+ pages covering all hazard types.',
    url: 'https://www.ready.gov/sites/default/files/2021-11/are-you-ready-guide.pdf',
    sizeMb: 20,
    category: 'Emergency',
    type: 'pdf',
    tags: ['fema', 'preparedness'],
  },

  // ═══════════════════════════════════════
  //  MEDICAL & FIRST AID
  // ═══════════════════════════════════════
  {
    id: 'medlineplus',
    name: 'MedlinePlus Medical Encyclopedia',
    description: 'NIH consumer health encyclopedia — symptoms, conditions, medications, first aid.',
    url: 'https://download.kiwix.org/zim/other/medlineplus.gov_en_all_2025-01.zim',
    sizeMb: 1_800,
    category: 'Medical',
    type: 'zim',
    tags: ['health', 'medical', 'first-aid'],
  },
  {
    id: 'army-first-aid',
    name: 'FM 4-25.11 First Aid',
    description: 'U.S. Army first aid field manual — bleeding, fractures, burns, shock, CPR.',
    url: 'https://ia800501.us.archive.org/7/items/FM4-25.11/FM4-25.11.pdf',
    sizeMb: 12,
    category: 'Medical',
    type: 'pdf',
    tags: ['first-aid', 'military', 'field-manual'],
  },

  // ═══════════════════════════════════════
  //  MILITARY & TACTICAL
  // ═══════════════════════════════════════
  {
    id: 'army-pubs',
    name: 'Army Publishing Directorate',
    description: 'All unclassified U.S. Army field manuals, technical manuals, and doctrine publications.',
    url: 'https://download.kiwix.org/zim/other/armypubs_en_all_2024-12.zim',
    sizeMb: 7_700,
    category: 'Military',
    type: 'zim',
    tags: ['military', 'field-manuals', 'doctrine'],
  },

  // ═══════════════════════════════════════
  //  REPAIR & TECHNICAL
  // ═══════════════════════════════════════
  {
    id: 'ifixit',
    name: 'iFixit Repair Guides',
    description: 'Step-by-step repair guides for electronics, appliances, vehicles, and more.',
    url: 'https://download.kiwix.org/zim/other/ifixit_en_all_2025-12.zim',
    sizeMb: 3_300,
    category: 'Technical',
    type: 'zim',
    tags: ['repair', 'electronics', 'appliances'],
  },
  {
    id: 'diy-stackexchange',
    name: 'DIY Stack Exchange',
    description: 'Home improvement Q&A — plumbing, electrical, carpentry, HVAC, and more.',
    url: 'https://download.kiwix.org/zim/stack_exchange/diy.stackexchange.com_en_all_2026-02.zim',
    sizeMb: 1_900,
    category: 'Technical',
    type: 'zim',
    tags: ['diy', 'plumbing', 'electrical', 'carpentry'],
  },
  {
    id: 'electronics-stackexchange',
    name: 'Electronics Stack Exchange',
    description: 'Electronics engineering Q&A — circuits, microcontrollers, power, radio, repair.',
    url: 'https://download.kiwix.org/zim/stack_exchange/electronics.stackexchange.com_en_all_2026-02.zim',
    sizeMb: 1_400,
    category: 'Technical',
    type: 'zim',
    tags: ['electronics', 'radio', 'circuits'],
  },

  // ═══════════════════════════════════════
  //  GARDENING & HOMESTEADING
  // ═══════════════════════════════════════
  {
    id: 'gardening-stackexchange',
    name: 'Gardening Stack Exchange',
    description: 'Gardening & landscaping Q&A — vegetables, soil, composting, pests, permaculture.',
    url: 'https://download.kiwix.org/zim/stack_exchange/gardening.stackexchange.com_en_all_2026-02.zim',
    sizeMb: 450,
    category: 'Homesteading',
    type: 'zim',
    tags: ['gardening', 'food', 'permaculture'],
  },
  {
    id: 'sustainability-stackexchange',
    name: 'Sustainability Stack Exchange',
    description: 'Off-grid living, renewable energy, water harvesting, waste management Q&A.',
    url: 'https://download.kiwix.org/zim/stack_exchange/sustainability.stackexchange.com_en_all_2026-02.zim',
    sizeMb: 120,
    category: 'Homesteading',
    type: 'zim',
    tags: ['off-grid', 'solar', 'water', 'sustainability'],
  },
  {
    id: 'wikibooks-en',
    name: 'Wikibooks (English)',
    description: 'Open textbooks — cooking, gardening, first aid, electronics, languages, and more.',
    url: 'https://download.kiwix.org/zim/wikibooks/wikibooks_en_all_maxi_2025-03.zim',
    sizeMb: 1_600,
    category: 'Homesteading',
    type: 'zim',
    tags: ['textbooks', 'cooking', 'howto'],
  },

  // ═══════════════════════════════════════
  //  GENERAL KNOWLEDGE
  // ═══════════════════════════════════════
  {
    id: 'wikipedia-en-simple',
    name: 'Wikipedia (Simple English)',
    description: 'Simple English Wikipedia — clear language, essential knowledge, ~230K articles.',
    url: 'https://download.kiwix.org/zim/wikipedia/wikipedia_en_simple_all_maxi_2025-03.zim',
    sizeMb: 780,
    category: 'Reference',
    type: 'zim',
    tags: ['encyclopedia', 'wikipedia'],
  },
  {
    id: 'wikipedia-en-all',
    name: 'Wikipedia (English, Full)',
    description: 'Complete English Wikipedia with all articles and images — 6.8M+ articles.',
    url: 'https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_maxi_2025-03.zim',
    sizeMb: 97_000,
    category: 'Reference',
    type: 'zim',
    tags: ['encyclopedia', 'wikipedia'],
  },
  {
    id: 'wiktionary-en',
    name: 'Wiktionary (English)',
    description: 'Complete English dictionary with definitions, pronunciations, and etymologies.',
    url: 'https://download.kiwix.org/zim/wiktionary/wiktionary_en_all_maxi_2025-03.zim',
    sizeMb: 6_400,
    category: 'Reference',
    type: 'zim',
    tags: ['dictionary', 'language'],
  },
  {
    id: 'gutenberg-en',
    name: 'Project Gutenberg (English)',
    description: 'Over 60,000 free public-domain ebooks — literature, science, history.',
    url: 'https://download.kiwix.org/zim/gutenberg/gutenberg_en_all_2025-03.zim',
    sizeMb: 64_000,
    category: 'Reference',
    type: 'zim',
    tags: ['books', 'literature', 'ebooks'],
  },
  {
    id: 'wikivoyage-en',
    name: 'Wikivoyage (English)',
    description: 'Travel guide with destination info, maps, itineraries, and local tips.',
    url: 'https://download.kiwix.org/zim/wikivoyage/wikivoyage_en_all_maxi_2025-03.zim',
    sizeMb: 820,
    category: 'Reference',
    type: 'zim',
    tags: ['travel', 'geography'],
  },

  // ═══════════════════════════════════════
  //  MAPS — handled by MapExtractService region picker
  //  (Library > Maps tab uses /api/map/regions, not this manifest)
  // ═══════════════════════════════════════
]

/**
 * Pre-built content packs — curated bundles for common use cases.
 * Each pack references manifest item IDs.
 */
const CONTENT_PACKS: ContentPack[] = [
  {
    id: 'emergency-essentials',
    name: 'Emergency Essentials',
    description: 'FEMA guides, survival manuals, first aid, and post-disaster recovery. The minimum for any preparedness setup.',
    icon: 'shield',
    color: 'red',
    items: ['ready-gov', 'post-disaster', 'army-survival', 'fema-are-you-ready', 'medlineplus', 'army-first-aid'],
  },
  {
    id: 'prepper-complete',
    name: 'Prepper Complete',
    description: 'Full off-grid knowledge — survival, medical, repair, gardening, sustainability, plus Simple Wikipedia for general reference.',
    icon: 'compass',
    color: 'amber',
    items: [
      'ready-gov', 'post-disaster', 'army-survival', 'fema-are-you-ready',
      'medlineplus', 'army-first-aid',
      'ifixit', 'diy-stackexchange',
      'gardening-stackexchange', 'sustainability-stackexchange', 'wikibooks-en',
      'wikipedia-en-simple',
    ],
  },
  {
    id: 'handyman',
    name: 'Handyman & Repair',
    description: 'Everything you need to fix, build, and maintain — electronics, plumbing, electrical, appliances.',
    icon: 'wrench',
    color: 'blue',
    items: ['ifixit', 'diy-stackexchange', 'electronics-stackexchange'],
  },
  {
    id: 'homesteader',
    name: 'Homesteader',
    description: 'Gardening, sustainability, cooking, and practical how-to knowledge for self-sufficient living.',
    icon: 'leaf',
    color: 'green',
    items: ['gardening-stackexchange', 'sustainability-stackexchange', 'wikibooks-en'],
  },
  {
    id: 'tactical',
    name: 'Military & Tactical',
    description: 'Complete Army field manuals, survival doctrine, and first aid — the entire Army Publishing Directorate.',
    icon: 'target',
    color: 'slate',
    items: ['army-pubs', 'army-survival', 'army-first-aid'],
  },
  {
    id: 'knowledge-base',
    name: 'General Knowledge',
    description: 'Wikipedia, dictionary, travel guide, and 60,000+ classic ebooks. The world\'s knowledge offline.',
    icon: 'book',
    color: 'purple',
    items: ['wikipedia-en-simple', 'wikipedia-en-all', 'wiktionary-en', 'gutenberg-en', 'wikivoyage-en'],
  },
]

export default class CollectionManifestService {
  async getAvailableContent(): Promise<ManifestItem[]> {
    logger.info({ count: CURATED_MANIFEST.length }, 'Returning curated content manifest')
    return CURATED_MANIFEST
  }

  async getContentPacks(): Promise<ContentPack[]> {
    return CONTENT_PACKS
  }

  async getCategories(): Promise<string[]> {
    const categories = [...new Set(CURATED_MANIFEST.map((item) => item.category))]
    return categories.sort()
  }
}
