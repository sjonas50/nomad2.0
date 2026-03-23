import { test } from '@japa/runner'
import DockerService from '#services/docker_service'
import DownloadService from '#services/download_service'
import ZimService from '#services/zim_service'
import MapService from '#services/map_service'
import CollectionManifestService from '#services/collection_manifest_service'

test.group('Content Services — Unit Tests', () => {
  test('DockerService instantiates correctly', ({ assert }) => {
    const service = new DockerService()
    assert.isDefined(service)
    assert.isFunction(service.listContainers)
    assert.isFunction(service.startContainer)
    assert.isFunction(service.stopContainer)
    assert.isFunction(service.restartContainer)
    assert.isFunction(service.getContainerLogs)
    assert.isFunction(service.isAvailable)
  })

  test('DownloadService instantiates correctly', ({ assert }) => {
    const service = new DownloadService()
    assert.isDefined(service)
    assert.isFunction(service.download)
    assert.isFunction(service.cancel)
    assert.isFunction(service.getProgress)
    assert.isFunction(service.listActive)
  })

  test('DownloadService listActive returns empty initially', ({ assert }) => {
    const service = new DownloadService()
    const active = service.listActive()
    assert.isArray(active)
    assert.lengthOf(active, 0)
  })

  test('DownloadService getProgress returns null for unknown id', ({ assert }) => {
    const service = new DownloadService()
    assert.isNull(service.getProgress('nonexistent'))
    assert.isNull(service.getStatus('nonexistent'))
  })

  test('DownloadService cancel returns false for unknown id', ({ assert }) => {
    const service = new DownloadService()
    assert.isFalse(service.cancel('nonexistent'))
  })

  test('ZimService instantiates correctly', ({ assert }) => {
    const service = new ZimService()
    assert.isDefined(service)
    assert.isFunction(service.listFiles)
    assert.isFunction(service.getFile)
    assert.isFunction(service.getCategoryFromName)
  })

  test('ZimService derives categories from filenames', ({ assert }) => {
    const service = new ZimService()
    assert.equal(service.getCategoryFromName('wikipedia_en_all.zim'), 'Wikipedia')
    assert.equal(service.getCategoryFromName('wiktionary_en.zim'), 'Wiktionary')
    assert.equal(service.getCategoryFromName('stackexchange_math.zim'), 'Stack Exchange')
    assert.equal(service.getCategoryFromName('random_file.zim'), 'Other')
  })

  test('MapService instantiates correctly', ({ assert }) => {
    const service = new MapService()
    assert.isDefined(service)
    assert.isFunction(service.listRegions)
    assert.isFunction(service.getRegion)
    assert.isFunction(service.getRegionFromName)
  })

  test('MapService derives regions from filenames', ({ assert }) => {
    const service = new MapService()
    const region = service.getRegionFromName('north-america.pmtiles')
    assert.isString(region)
  })

  test('CollectionManifestService returns curated content', async ({ assert }) => {
    const service = new CollectionManifestService()
    const items = await service.getAvailableContent()
    assert.isArray(items)
    assert.isAbove(items.length, 0)
    // Each item should have required fields
    for (const item of items) {
      assert.properties(item, ['id', 'name', 'description', 'url', 'sizeMb', 'category', 'type'])
    }
  })

  test('CollectionManifestService returns categories', async ({ assert }) => {
    const service = new CollectionManifestService()
    const categories = await service.getCategories()
    assert.isArray(categories)
    assert.isAbove(categories.length, 0)
  })

  test('InstalledResource model exists', async ({ assert }) => {
    const { default: InstalledResource } = await import('#models/installed_resource')
    assert.isDefined(InstalledResource)
    assert.equal(InstalledResource.table, 'installed_resources')
  })
})
