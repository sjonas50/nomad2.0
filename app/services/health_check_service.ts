import redis from '@adonisjs/redis/services/main'
import logger from '@adonisjs/core/services/logger'

export default class HealthCheckService {
  /**
   * Validates that Redis is configured with noeviction policy.
   * This is critical — any other policy silently drops BullMQ jobs.
   */
  async validateRedisConfig(): Promise<void> {
    const info = await redis.call('CONFIG', 'GET', 'maxmemory-policy')
    const policy = Array.isArray(info) ? info[1] : null

    if (policy && policy !== 'noeviction') {
      logger.warn(
        `Redis maxmemory-policy is "${policy}" — must be "noeviction" for BullMQ. Jobs may be silently dropped.`
      )
    } else {
      logger.info('Redis maxmemory-policy validated: noeviction')
    }
  }

  /**
   * Check if an external service is reachable via HTTP.
   */
  async checkHttp(url: string, name: string): Promise<boolean> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (response.ok) {
        logger.info(`${name} is healthy at ${url}`)
        return true
      }
      logger.warn(`${name} returned ${response.status} at ${url}`)
      return false
    } catch (error) {
      logger.warn(`${name} is not reachable at ${url}: ${error}`)
      return false
    }
  }
}
