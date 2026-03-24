import { FalkorDB, type Graph } from 'falkordb'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

interface RelatedEntity {
  name: string
  type: string
  relationship: string
}

interface EntityResult {
  name: string
  type: string
}

export default class GraphService {
  private enabled: boolean
  private db: FalkorDB | null = null
  private graph: Graph | null = null
  private graphName: string

  constructor() {
    this.enabled = env.get('FALKORDB_ENABLED', false)
    this.graphName = 'attic_knowledge'
  }

  /**
   * Connect to FalkorDB and create the graph schema + indexes.
   * No-op when FALKORDB_ENABLED is false.
   */
  async initialize(): Promise<void> {
    if (!this.enabled) {
      logger.info('GraphService disabled (FALKORDB_ENABLED=false)')
      return
    }

    const host = env.get('FALKORDB_HOST', 'localhost')
    const port = env.get('FALKORDB_PORT', 6380)

    try {
      this.db = await FalkorDB.connect({
        socket: { host, port },
      })
      this.graph = this.db.selectGraph(this.graphName)
      logger.info(`Connected to FalkorDB at ${host}:${port}, graph: ${this.graphName}`)

      await this.createSchema()
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize GraphService')
      this.enabled = false
      this.db = null
      this.graph = null
    }
  }

  /**
   * Create node labels, relationship types, and indexes.
   * Idempotent — safe to call on every boot.
   */
  private async createSchema(): Promise<void> {
    if (!this.graph) return

    // Ensure Entity node index on name for fast lookups
    try {
      await this.graph.createNodeRangeIndex('Entity', 'name')
    } catch {
      // Index already exists
    }

    try {
      await this.graph.createNodeRangeIndex('Entity', 'type')
    } catch {
      // Index already exists
    }

    // Full-text index on Entity name for search
    try {
      await this.graph.createNodeFulltextIndex('Entity', 'name')
    } catch {
      // Index already exists
    }

    logger.info('Graph schema and indexes ensured')
  }

  /**
   * Add an entity node to the knowledge graph.
   * Merges on name to avoid duplicates.
   */
  async addEntity(
    name: string,
    type: string,
    properties?: Record<string, unknown>
  ): Promise<void> {
    if (!this.enabled || !this.graph) return

    const props = properties ?? {}
    // Sanitize property keys to prevent Cypher injection
    const propEntries = Object.entries(props).filter(([key]) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key))
    const setClauses = propEntries.map(([key]) => `n.${key} = $${key}`).join(', ')
    const setStatement = setClauses ? `, ${setClauses}` : ''

    const cypher = `MERGE (n:Entity {name: $name})
      ON CREATE SET n.type = $type, n.created_at = timestamp()${setStatement}
      ON MATCH SET n.type = $type, n.updated_at = timestamp()${setStatement}`

    const params = { name, type, ...props } as any

    try {
      await this.graph.query(cypher, { params })
      logger.debug({ name, type }, 'Entity added/updated')
    } catch (error) {
      logger.error({ err: error, name, type }, 'Failed to add entity')
      throw error
    }
  }

  /**
   * Add a relationship between two entities (by name).
   * Creates both entities if they do not yet exist.
   */
  async addRelationship(
    fromName: string,
    toName: string,
    relType: string,
    properties?: Record<string, unknown>
  ): Promise<void> {
    if (!this.enabled || !this.graph) return

    // Sanitize relType to prevent Cypher injection — only allow uppercase letters and underscores
    if (!/^[A-Z_][A-Z0-9_]*$/.test(relType)) {
      relType = relType.toUpperCase().replace(/[^A-Z0-9_]/g, '_')
      if (!relType || !/^[A-Z_]/.test(relType)) relType = 'RELATED_TO'
    }

    const props = properties ?? {}
    const propString = Object.keys(props).length
      ? `{${Object.entries(props)
          .map(([key]) => `${key}: $${key}`)
          .join(', ')}}`
      : ''

    const cypher = `MERGE (a:Entity {name: $fromName})
      MERGE (b:Entity {name: $toName})
      MERGE (a)-[r:${relType} ${propString}]->(b)
      ON CREATE SET r.created_at = timestamp()
      ON MATCH SET r.updated_at = timestamp()`

    const params = { fromName, toName, ...props } as any

    try {
      await this.graph.query(cypher, { params })
      logger.debug({ fromName, toName, relType }, 'Relationship added/updated')
    } catch (error) {
      logger.error({ err: error, fromName, toName, relType }, 'Failed to add relationship')
      throw error
    }
  }

  /**
   * Find entities related to a given entity within N hops.
   */
  async queryRelated(
    entityName: string,
    hops: number = 1,
    limit: number = 20
  ): Promise<RelatedEntity[]> {
    if (!this.enabled || !this.graph) return []

    const cypher = `MATCH (source:Entity {name: $name})-[r*1..${hops}]-(target:Entity)
      RETURN DISTINCT target.name AS name, target.type AS type, type(r[-1]) AS relationship
      LIMIT $limit`

    try {
      const result = await this.graph.query<[string, string, string]>(cypher, {
        params: { name: entityName, limit },
      })

      return (result.data ?? []).map(([name, type, relationship]: [string, string, string]) => ({
        name,
        type,
        relationship,
      }))
    } catch (error) {
      logger.error({ err: error, entityName, hops }, 'Failed to query related entities')
      return []
    }
  }

  /**
   * Search for entities whose name matches the query string.
   * Uses the full-text index when available.
   */
  async searchEntities(query: string, limit: number = 10): Promise<EntityResult[]> {
    if (!this.enabled || !this.graph) return []

    // Use CONTAINS for partial matching as a fallback-safe approach
    const cypher = `MATCH (n:Entity)
      WHERE toLower(n.name) CONTAINS toLower($query)
      RETURN n.name AS name, n.type AS type
      LIMIT $limit`

    try {
      const result = await this.graph.query<[string, string]>(cypher, {
        params: { query, limit },
      })

      return (result.data ?? []).map(([name, type]: [string, string]) => ({
        name,
        type,
      }))
    } catch (error) {
      logger.error({ err: error, query }, 'Failed to search entities')
      return []
    }
  }

  /**
   * Health check — returns true if FalkorDB is reachable and the graph responds.
   */
  async isAvailable(): Promise<boolean> {
    if (!this.enabled || !this.db) return false

    try {
      await this.db.list()
      return true
    } catch {
      return false
    }
  }

  /**
   * Close the FalkorDB connection.
   */
  async close(): Promise<void> {
    if (this.db) {
      try {
        await this.db.close()
        logger.info('GraphService connection closed')
      } catch (error) {
        logger.error({ err: error }, 'Error closing GraphService connection')
      } finally {
        this.db = null
        this.graph = null
      }
    }
  }
}
