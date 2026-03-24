import AppLayout from '../layouts/app_layout'
import { Head } from '@inertiajs/react'
import { useState, useEffect, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { layers as protoLayers, DARK } from '@protomaps/basemaps'

interface MapMarker {
  id: string
  type: 'mesh_node' | 'resource' | 'personnel'
  name: string
  latitude: number
  longitude: number
  status?: string
  metadata?: Record<string, unknown>
}

interface GeofenceItem {
  id: number
  name: string
  type: string
  geometry: { type: string; coordinates: number[][][] }
  description: string | null
  color: string | null
}

const MARKER_COLORS: Record<string, string> = {
  mesh_node: '#3b82f6',
  resource: '#f59e0b',
  personnel: '#10b981',
}

const STATUS_COLORS: Record<string, string> = {
  online: '#22c55e',
  offline: '#6b7280',
  available: '#22c55e',
  assigned: '#3b82f6',
  deployed: '#3b82f6',
  injured: '#ef4444',
  out_of_service: '#6b7280',
}

const GEOFENCE_COLORS: Record<string, string> = {
  safe_area: '#22c55e',
  hazard: '#ef4444',
  rally_point: '#3b82f6',
  exclusion: '#f59e0b',
}

type LayerFilter = 'mesh_node' | 'resource' | 'personnel' | 'geofence'

interface TileRegion {
  name: string
  sizeMb: number
  region: string
}

interface Props {
  tileRegions?: TileRegion[]
}

// Register PMTiles protocol once
let protocolRegistered = false
function ensurePmtilesProtocol() {
  if (protocolRegistered || typeof window === 'undefined') return
  const protocol = new Protocol()
  maplibregl.addProtocol('pmtiles', protocol.tile)
  protocolRegistered = true
}

function osmStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 19 }],
  }
}

function pmtilesStyle(tileUrl: string): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://cdn.protomaps.com/fonts/pbf/{fontstack}/{range}.pbf',
    sources: {
      protomaps: { type: 'vector', url: tileUrl },
    },
    layers: protoLayers('protomaps', DARK),
  }
}

export default function MapPage({ tileRegions = [] }: Props) {
  const [markers, setMarkers] = useState<MapMarker[]>([])
  const [geofences, setGeofences] = useState<GeofenceItem[]>([])
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null)
  const [layers, setLayers] = useState<Set<LayerFilter>>(
    new Set(['mesh_node', 'resource', 'personnel', 'geofence'])
  )
  const [loading, setLoading] = useState(true)
  const [mapReady, setMapReady] = useState(false)
  const [tileMode, setTileMode] = useState<'osm' | 'offline'>('osm')

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [markersRes, geofencesRes] = await Promise.all([
        fetch('/api/map/markers'),
        fetch('/api/map/geofences'),
      ])
      if (markersRes.ok) {
        const data = await markersRes.json()
        setMarkers(data.markers || [])
      }
      if (geofencesRes.ok) {
        const data = await geofencesRes.json()
        setGeofences(data.geofences || [])
      }
    } catch { /* offline is fine */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Initialize MapLibre — recreate when tile mode changes
  useEffect(() => {
    if (!mapContainerRef.current || typeof window === 'undefined') return

    let style: maplibregl.StyleSpecification
    if (tileMode === 'offline' && tileRegions.length > 0) {
      ensurePmtilesProtocol()
      const tileUrl = `pmtiles://${window.location.origin}/api/map/tiles/${tileRegions[0].name}`
      style = pmtilesStyle(tileUrl)
    } else {
      style = osmStyle()
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style,
      center: [-111.89, 40.76],
      zoom: 6,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    map.on('load', () => {
      mapRef.current = map
      setMapReady(true)
    })

    map.on('error', (e) => {
      console.error('MapLibre error:', e.error?.message || e)
      if (tileMode === 'offline') {
        setTileMode('osm')
      }
    })

    return () => {
      mapRef.current = null
      setMapReady(false)
      map.remove()
    }
  }, [tileMode, tileRegions])

  // Sync markers to map
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const features = markers.map((m) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [m.longitude, m.latitude] },
      properties: {
        id: m.id,
        name: m.name,
        type: m.type,
        status: m.status || '',
        color: STATUS_COLORS[m.status || ''] || MARKER_COLORS[m.type] || '#888',
      },
    }))

    const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }

    if (map.getSource('markers')) {
      (map.getSource('markers') as maplibregl.GeoJSONSource).setData(geojson)
    } else {
      map.addSource('markers', { type: 'geojson', data: geojson })

      map.addLayer({
        id: 'markers-circle',
        type: 'circle',
        source: 'markers',
        paint: {
          'circle-radius': 7,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      map.addLayer({
        id: 'markers-label',
        type: 'symbol',
        source: 'markers',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#1a1a2e',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      })

      map.on('click', 'markers-circle', (e) => {
        const feat = e.features?.[0]
        if (feat) {
          const m = markers.find((mk) => mk.id === feat.properties?.id)
          if (m) setSelectedMarker(m)
        }
      })

      map.on('mouseenter', 'markers-circle', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'markers-circle', () => {
        map.getCanvas().style.cursor = ''
      })
    }
  }, [markers, mapReady])

  // Sync geofences to map
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const features = geofences.map((g) => ({
      type: 'Feature' as const,
      geometry: g.geometry as GeoJSON.Geometry,
      properties: {
        id: g.id,
        name: g.name,
        type: g.type,
        color: g.color || GEOFENCE_COLORS[g.type] || '#888',
      },
    }))

    const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }

    if (map.getSource('geofences')) {
      (map.getSource('geofences') as maplibregl.GeoJSONSource).setData(geojson)
    } else {
      map.addSource('geofences', { type: 'geojson', data: geojson })

      map.addLayer({
        id: 'geofences-fill',
        type: 'fill',
        source: 'geofences',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.2,
        },
      })

      map.addLayer({
        id: 'geofences-line',
        type: 'line',
        source: 'geofences',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
        },
      })
    }
  }, [geofences, mapReady])

  // Sync layer visibility
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    if (map.getLayer('markers-circle')) {
      const activeTypes = ['mesh_node', 'resource', 'personnel'].filter((t) =>
        layers.has(t as LayerFilter)
      )
      const anyMarkers = activeTypes.length > 0
      map.setLayoutProperty('markers-circle', 'visibility', anyMarkers ? 'visible' : 'none')
      map.setLayoutProperty('markers-label', 'visibility', anyMarkers ? 'visible' : 'none')
      if (anyMarkers) {
        map.setFilter('markers-circle', ['in', ['get', 'type'], ['literal', activeTypes]])
        map.setFilter('markers-label', ['in', ['get', 'type'], ['literal', activeTypes]])
      }
    }

    if (map.getLayer('geofences-fill')) {
      const vis = layers.has('geofence') ? 'visible' : 'none'
      map.setLayoutProperty('geofences-fill', 'visibility', vis)
      map.setLayoutProperty('geofences-line', 'visibility', vis)
    }
  }, [layers, mapReady])

  const toggleLayer = (layer: LayerFilter) => {
    setLayers((prev) => {
      const next = new Set(prev)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      return next
    })
  }

  const flyTo = (m: MapMarker) => {
    setSelectedMarker(m)
    mapRef.current?.flyTo({ center: [m.longitude, m.latitude], zoom: 14, duration: 1000 })
  }

  const filteredMarkers = markers.filter((m) => layers.has(m.type))

  return (
    <AppLayout>
      <Head title="Map" />
      <div className="flex" style={{ height: 'calc(100vh - 3.5rem)' }}>
        {/* Sidebar */}
        <div className="w-72 border-r border-zinc-800 bg-surface-900 p-4 overflow-y-auto shrink-0">
          <h2 className="text-lg font-semibold text-white mb-4">Situational Map</h2>

          {/* Tile source toggle */}
          <div className="mb-4 p-2.5 bg-surface-800 rounded-lg border border-zinc-800">
            <div className="text-xs text-zinc-500 mb-1.5">Tile source</div>
            <div className="flex gap-1">
              <button
                onClick={() => setTileMode('osm')}
                className={`flex-1 text-xs py-1.5 rounded transition-colors ${tileMode === 'osm' ? 'bg-brand-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                OSM Online
              </button>
              <button
                onClick={() => setTileMode('offline')}
                disabled={tileRegions.length === 0}
                className={`flex-1 text-xs py-1.5 rounded transition-colors ${tileMode === 'offline' ? 'bg-brand-500 text-white' : 'text-zinc-400 hover:text-zinc-200'} disabled:opacity-30 disabled:cursor-not-allowed`}
                title={tileRegions.length === 0 ? 'No offline tiles available — add PMTiles to storage/maps/' : `${tileRegions[0].region} (${tileRegions[0].sizeMb} MB)`}
              >
                Offline{tileRegions.length > 0 ? ` (${tileRegions.length})` : ''}
              </button>
            </div>
          </div>

          {/* Layer toggles */}
          <div className="space-y-2 mb-6">
            <h3 className="text-xs font-medium text-zinc-500 uppercase">Layers</h3>
            {([
              { key: 'mesh_node' as LayerFilter, label: 'Mesh Nodes', color: MARKER_COLORS.mesh_node },
              { key: 'resource' as LayerFilter, label: 'Resources', color: MARKER_COLORS.resource },
              { key: 'personnel' as LayerFilter, label: 'Personnel', color: MARKER_COLORS.personnel },
              { key: 'geofence' as LayerFilter, label: 'Geofences', color: '#888' },
            ]).map((layer) => (
              <label key={layer.key} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={layers.has(layer.key)}
                  onChange={() => toggleLayer(layer.key)}
                  className="rounded"
                />
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: layer.color }}
                />
                {layer.label}
                <span className="text-zinc-600 ml-auto">
                  {layer.key === 'geofence'
                    ? geofences.length
                    : markers.filter((m) => m.type === layer.key).length}
                </span>
              </label>
            ))}
          </div>

          {/* Marker list */}
          <div className="space-y-1">
            <h3 className="text-xs font-medium text-zinc-500 uppercase mb-2">
              Markers ({filteredMarkers.length})
            </h3>
            {filteredMarkers.map((m) => (
              <button
                key={m.id}
                onClick={() => flyTo(m)}
                className={`w-full text-left rounded px-2 py-1.5 text-sm hover:bg-surface-800 transition-colors ${
                  selectedMarker?.id === m.id ? 'bg-surface-800' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor:
                        STATUS_COLORS[m.status || ''] || MARKER_COLORS[m.type],
                    }}
                  />
                  <span className="truncate text-zinc-300">{m.name}</span>
                </div>
                <div className="text-xs text-zinc-600 ml-4">
                  {m.latitude.toFixed(4)}, {m.longitude.toFixed(4)}
                </div>
              </button>
            ))}
            {filteredMarkers.length === 0 && !loading && (
              <p className="text-sm text-zinc-500">No markers with positions.</p>
            )}
          </div>

          {/* Geofences */}
          {layers.has('geofence') && geofences.length > 0 && (
            <div className="mt-4 space-y-1">
              <h3 className="text-xs font-medium text-zinc-500 uppercase mb-2">Geofences</h3>
              {geofences.map((g) => (
                <div key={g.id} className="rounded px-2 py-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{
                        backgroundColor: g.color || GEOFENCE_COLORS[g.type] || '#888',
                      }}
                    />
                    <span className="text-zinc-300">{g.name}</span>
                    <span className="text-xs text-zinc-600 capitalize ml-auto">{g.type.replace(/_/g, ' ')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Map area */}
        <div className="flex-1 min-h-0">
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

          {/* Selected marker detail card */}
          {selectedMarker && (
            <div className="absolute bottom-4 left-4 bg-surface-900 border border-zinc-700 rounded-lg p-4 w-80 shadow-xl z-10">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-white">{selectedMarker.name}</h4>
                <button
                  onClick={() => setSelectedMarker(null)}
                  className="text-zinc-500 hover:text-white text-lg leading-none"
                >
                  &times;
                </button>
              </div>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Type:</span>
                  <span className="text-zinc-300 capitalize">{selectedMarker.type.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Position:</span>
                  <span className="text-zinc-300">
                    {selectedMarker.latitude.toFixed(5)}, {selectedMarker.longitude.toFixed(5)}
                  </span>
                </div>
                {selectedMarker.status && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Status:</span>
                    <span className="text-zinc-300 capitalize">{selectedMarker.status}</span>
                  </div>
                )}
                {selectedMarker.metadata &&
                  Object.entries(selectedMarker.metadata)
                    .filter(([, v]) => v != null)
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-zinc-500 capitalize">{k.replace(/([A-Z])/g, ' $1')}:</span>
                        <span className="text-zinc-300">{String(v)}</span>
                      </div>
                    ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
