import AppLayout from '../layouts/app_layout'
import { useState, useEffect, useRef, useCallback } from 'react'

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

export default function MapPage() {
  const [markers, setMarkers] = useState<MapMarker[]>([])
  const [geofences, setGeofences] = useState<GeofenceItem[]>([])
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null)
  const [layers, setLayers] = useState<Set<LayerFilter>>(
    new Set(['mesh_node', 'resource', 'personnel', 'geofence'])
  )
  const [loading, setLoading] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)

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
    const interval = setInterval(fetchData, 10000) // Refresh every 10s
    return () => clearInterval(interval)
  }, [fetchData])

  const toggleLayer = (layer: LayerFilter) => {
    setLayers((prev) => {
      const next = new Set(prev)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      return next
    })
  }

  const filteredMarkers = markers.filter((m) => layers.has(m.type))

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Sidebar */}
        <div className="w-72 border-r border-gray-800 bg-gray-900 p-4 overflow-y-auto">
          <h2 className="text-lg font-semibold mb-4">Situational Map</h2>

          {/* Layer toggles */}
          <div className="space-y-2 mb-6">
            <h3 className="text-xs font-medium text-gray-500 uppercase">Layers</h3>
            {([
              { key: 'mesh_node' as LayerFilter, label: 'Mesh Nodes', color: MARKER_COLORS.mesh_node },
              { key: 'resource' as LayerFilter, label: 'Resources', color: MARKER_COLORS.resource },
              { key: 'personnel' as LayerFilter, label: 'Personnel', color: MARKER_COLORS.personnel },
              { key: 'geofence' as LayerFilter, label: 'Geofences', color: '#888' },
            ]).map((layer) => (
              <label key={layer.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={layers.has(layer.key)}
                  onChange={() => toggleLayer(layer.key)}
                  className="rounded"
                />
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: layer.color }}
                />
                {layer.label}
                <span className="text-gray-500 ml-auto">
                  {layer.key === 'geofence'
                    ? geofences.length
                    : markers.filter((m) => m.type === layer.key).length}
                </span>
              </label>
            ))}
          </div>

          {/* Marker list */}
          <div className="space-y-1">
            <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">
              Markers ({filteredMarkers.length})
            </h3>
            {filteredMarkers.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMarker(m)}
                className={`w-full text-left rounded px-2 py-1.5 text-sm hover:bg-gray-800 ${
                  selectedMarker?.id === m.id ? 'bg-gray-800' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        STATUS_COLORS[m.status || ''] || MARKER_COLORS[m.type],
                    }}
                  />
                  <span className="truncate">{m.name}</span>
                </div>
                <div className="text-xs text-gray-500 ml-4">
                  {m.latitude.toFixed(4)}, {m.longitude.toFixed(4)}
                </div>
              </button>
            ))}
            {filteredMarkers.length === 0 && !loading && (
              <p className="text-sm text-gray-500">No markers with positions.</p>
            )}
          </div>

          {/* Geofences */}
          {layers.has('geofence') && geofences.length > 0 && (
            <div className="mt-4 space-y-1">
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Geofences</h3>
              {geofences.map((g) => (
                <div
                  key={g.id}
                  className="rounded px-2 py-1.5 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-sm"
                      style={{
                        backgroundColor: g.color || GEOFENCE_COLORS[g.type] || '#888',
                      }}
                    />
                    <span>{g.name}</span>
                    <span className="text-xs text-gray-500 capitalize ml-auto">{g.type.replace(/_/g, ' ')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Map area */}
        <div className="flex-1 relative bg-gray-950">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              Loading map data...
            </div>
          ) : filteredMarkers.length === 0 && geofences.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p className="text-lg">No position data available</p>
                <p className="text-sm mt-1">
                  Connect Meshtastic nodes or check in personnel with GPS coordinates
                </p>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              {/* MapLibre GL JS integration point */}
              {/* For production: install maplibre-gl and render actual map */}
              <div className="text-center space-y-4">
                <div className="bg-gray-900 rounded-lg p-6 max-w-lg">
                  <h3 className="text-lg font-medium mb-2">Map View</h3>
                  <p className="text-sm text-gray-400 mb-4">
                    {filteredMarkers.length} markers, {geofences.length} geofences loaded.
                    Install <code className="bg-gray-800 px-1 rounded">maplibre-gl</code> and
                    a PMTiles base layer for the full offline map experience.
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {filteredMarkers.slice(0, 6).map((m) => (
                      <div
                        key={m.id}
                        className="bg-gray-800 rounded p-2 cursor-pointer hover:bg-gray-700"
                        onClick={() => setSelectedMarker(m)}
                      >
                        <div className="flex items-center gap-1">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: MARKER_COLORS[m.type] }}
                          />
                          <span className="truncate">{m.name}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {m.latitude.toFixed(4)}, {m.longitude.toFixed(4)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Selected marker detail card */}
          {selectedMarker && (
            <div className="absolute bottom-4 left-4 bg-gray-900 border border-gray-700 rounded-lg p-4 w-80">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">{selectedMarker.name}</h4>
                <button
                  onClick={() => setSelectedMarker(null)}
                  className="text-gray-500 hover:text-white"
                >
                  ×
                </button>
              </div>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Type:</span>
                  <span className="capitalize">{selectedMarker.type.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Position:</span>
                  <span>
                    {selectedMarker.latitude.toFixed(5)}, {selectedMarker.longitude.toFixed(5)}
                  </span>
                </div>
                {selectedMarker.status && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status:</span>
                    <span className="capitalize">{selectedMarker.status}</span>
                  </div>
                )}
                {selectedMarker.metadata &&
                  Object.entries(selectedMarker.metadata)
                    .filter(([, v]) => v != null)
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-gray-500 capitalize">{k.replace(/([A-Z])/g, ' $1')}:</span>
                        <span>{String(v)}</span>
                      </div>
                    ))}
              </div>
            </div>
          )}

          {/* Auto-refresh indicator */}
          <div className="absolute top-4 right-4 text-xs text-gray-600">
            Auto-refresh: 10s
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
