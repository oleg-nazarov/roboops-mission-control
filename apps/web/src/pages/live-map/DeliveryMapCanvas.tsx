import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { deliveryPointToLngLat, statusHexByRobotStatus } from './mapUtils'
import type { LiveRobotMapData, MissionTargetMapData, SimPoint } from './types'

type TrailPoint = {
  ts: number
  x: number
  y: number
  heading: number
}

type DeliveryMapCanvasProps = {
  robots: LiveRobotMapData[]
  missionTargets: MissionTargetMapData[]
  trailsByRobot: Record<string, TrailPoint[]>
  selectedRobotId: string | null
  onSelectRobot: (robotId: string | null) => void
}

const MAP_SOURCE_IDS = {
  layout: 'delivery-layout-source',
  roads: 'delivery-roads-source',
  raster: 'delivery-raster-source',
  geofences: 'delivery-geofences-source',
  trails: 'delivery-trails-source',
  targetLinks: 'delivery-target-links-source',
  targetFlagPoles: 'delivery-target-flag-poles-source',
  targetFlagBodies: 'delivery-target-flag-bodies-source',
  robots: 'delivery-robots-source',
} as const

const MAP_LAYER_IDS = {
  layoutFill: 'delivery-layout-fill-layer',
  layoutLine: 'delivery-layout-line-layer',
  roads: 'delivery-roads-layer',
  raster: 'delivery-raster-layer',
  geofenceFill: 'delivery-geofences-fill-layer',
  geofenceLine: 'delivery-geofences-line-layer',
  trails: 'delivery-trails-layer',
  targetLinks: 'delivery-target-links-layer',
  targetFlagPoles: 'delivery-target-flag-poles-layer',
  targetFlagBodies: 'delivery-target-flag-bodies-layer',
  robots: 'delivery-robots-layer',
} as const

const closedPolygon = (points: SimPoint[]): SimPoint[] => {
  if (points.length === 0) {
    return points
  }

  const first = points[0]
  const last = points[points.length - 1]
  if (first.x === last.x && first.y === last.y) {
    return points
  }

  return [...points, first]
}

const geofencePolygons: Array<{ id: string; points: SimPoint[] }> = [
  {
    id: 'pedestrian-corridor',
    points: closedPolygon([
      { x: 8, y: 20 },
      { x: 82, y: 22 },
      { x: 86, y: 44 },
      { x: 12, y: 46 },
    ]),
  },
  {
    id: 'restricted-crossing',
    points: closedPolygon([
      { x: 38, y: 56 },
      { x: 60, y: 57 },
      { x: 63, y: 76 },
      { x: 34, y: 74 },
    ]),
  },
]

const cityBlocks: Array<{ id: string; points: SimPoint[] }> = [
  {
    id: 'block-a',
    points: closedPolygon([
      { x: 6, y: 8 },
      { x: 30, y: 8 },
      { x: 31, y: 28 },
      { x: 8, y: 29 },
    ]),
  },
  {
    id: 'block-b',
    points: closedPolygon([
      { x: 36, y: 10 },
      { x: 62, y: 10 },
      { x: 63, y: 31 },
      { x: 37, y: 32 },
    ]),
  },
  {
    id: 'block-c',
    points: closedPolygon([
      { x: 68, y: 12 },
      { x: 94, y: 13 },
      { x: 93, y: 35 },
      { x: 70, y: 34 },
    ]),
  },
  {
    id: 'block-d',
    points: closedPolygon([
      { x: 10, y: 56 },
      { x: 36, y: 55 },
      { x: 37, y: 84 },
      { x: 12, y: 86 },
    ]),
  },
  {
    id: 'block-e',
    points: closedPolygon([
      { x: 42, y: 58 },
      { x: 72, y: 59 },
      { x: 70, y: 88 },
      { x: 44, y: 87 },
    ]),
  },
]

const roadSegments: Array<{ id: string; points: SimPoint[] }> = [
  {
    id: 'road-h-1',
    points: [
      { x: 0, y: 42 },
      { x: 100, y: 42 },
    ],
  },
  {
    id: 'road-h-2',
    points: [
      { x: 0, y: 52 },
      { x: 100, y: 52 },
    ],
  },
  {
    id: 'road-v-1',
    points: [
      { x: 33, y: 0 },
      { x: 33, y: 100 },
    ],
  },
  {
    id: 'road-v-2',
    points: [
      { x: 66, y: 0 },
      { x: 66, y: 100 },
    ],
  },
]

const deliveryPointToSvg = (point: SimPoint): { x: number; y: number } => ({
  x: 40 + point.x * 8.8,
  y: 520 - point.y * 4.6,
})

const setSourceData = (
  map: MapLibreMap,
  sourceId: string,
  data: GeoJSON.FeatureCollection,
): void => {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined
  source?.setData(data)
}

export function DeliveryMapCanvas({
  robots,
  missionTargets,
  trailsByRobot,
  selectedRobotId,
  onSelectRobot,
}: DeliveryMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const readyRef = useRef(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const onSelectRobotRef = useRef(onSelectRobot)

  useEffect(() => {
    onSelectRobotRef.current = onSelectRobot
  }, [onSelectRobot])

  const geofenceData = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = geofencePolygons.map((polygon) => ({
      type: 'Feature',
      id: polygon.id,
      geometry: {
        type: 'Polygon',
        coordinates: [polygon.points.map(deliveryPointToLngLat)],
      },
      properties: {
        zoneId: polygon.id,
      },
    }))

    return {
      type: 'FeatureCollection',
      features,
    }
  }, [])

  const layoutData = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = cityBlocks.map((block) => ({
      type: 'Feature',
      id: block.id,
      geometry: {
        type: 'Polygon',
        coordinates: [block.points.map(deliveryPointToLngLat)],
      },
      properties: {
        blockId: block.id,
      },
    }))

    return {
      type: 'FeatureCollection',
      features,
    }
  }, [])

  const roadsData = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = roadSegments.map((segment) => ({
      type: 'Feature',
      id: segment.id,
      geometry: {
        type: 'LineString',
        coordinates: segment.points.map(deliveryPointToLngLat),
      },
      properties: {
        roadId: segment.id,
      },
    }))

    return {
      type: 'FeatureCollection',
      features,
    }
  }, [])

  const robotData = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = robots.map((robot) => ({
      type: 'Feature',
      id: robot.robotId,
      geometry: {
        type: 'Point',
        coordinates: deliveryPointToLngLat(robot.pose),
      },
      properties: {
        robotId: robot.robotId,
        status: robot.status,
        selected: selectedRobotId === robot.robotId,
      },
    }))

    return {
      type: 'FeatureCollection',
      features,
    }
  }, [robots, selectedRobotId])

  const robotPoseById = useMemo(() => {
    const map = new Map<string, SimPoint>()
    for (const robot of robots) {
      map.set(robot.robotId, robot.pose)
    }
    return map
  }, [robots])

  const targetLinkData = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = []

    for (const target of missionTargets) {
      const robotPose = robotPoseById.get(target.robotId)
      if (!robotPose) {
        continue
      }

      features.push({
        type: 'Feature',
        id: `target-link-${target.robotId}`,
        geometry: {
          type: 'LineString',
          coordinates: [deliveryPointToLngLat(robotPose), deliveryPointToLngLat(target.target)],
        },
        properties: {
          robotId: target.robotId,
          selected: selectedRobotId === target.robotId,
        },
      })
    }

    return {
      type: 'FeatureCollection',
      features,
    }
  }, [missionTargets, robotPoseById, selectedRobotId])

  const targetFlagPoleData = useMemo<GeoJSON.FeatureCollection>(() => {
    const poleHeight = 2.7
    const features: GeoJSON.Feature[] = missionTargets.map((target) => ({
      type: 'Feature',
      id: `target-flag-pole-${target.robotId}`,
      geometry: {
        type: 'LineString',
        coordinates: [
          deliveryPointToLngLat(target.target),
          deliveryPointToLngLat({ x: target.target.x, y: target.target.y + poleHeight }),
        ],
      },
      properties: {
        robotId: target.robotId,
        selected: selectedRobotId === target.robotId,
      },
    }))

    return {
      type: 'FeatureCollection',
      features,
    }
  }, [missionTargets, selectedRobotId])

  const targetFlagBodyData = useMemo<GeoJSON.FeatureCollection>(() => {
    const poleHeight = 2.7
    const flagWidth = 2.4
    const flagHeight = 1.6
    const features: GeoJSON.Feature[] = missionTargets.map((target) => ({
      type: 'Feature',
      id: `target-flag-body-${target.robotId}`,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            deliveryPointToLngLat({ x: target.target.x, y: target.target.y + poleHeight }),
            deliveryPointToLngLat({
              x: target.target.x + flagWidth,
              y: target.target.y + poleHeight - flagHeight * 0.5,
            }),
            deliveryPointToLngLat({ x: target.target.x, y: target.target.y + poleHeight - flagHeight }),
            deliveryPointToLngLat({ x: target.target.x, y: target.target.y + poleHeight }),
          ],
        ],
      },
      properties: {
        robotId: target.robotId,
        selected: selectedRobotId === target.robotId,
      },
    }))

    return {
      type: 'FeatureCollection',
      features,
    }
  }, [missionTargets, selectedRobotId])

  const trailData = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = []

    for (const robot of robots) {
      const trail = trailsByRobot[robot.robotId]
      if (!trail || trail.length < 2) {
        continue
      }

      features.push({
        type: 'Feature',
        id: `trail-${robot.robotId}`,
        geometry: {
          type: 'LineString',
          coordinates: trail.map((point) => deliveryPointToLngLat(point)),
        },
        properties: {
          robotId: robot.robotId,
          selected: selectedRobotId === robot.robotId,
          status: robot.status,
        },
      })
    }

    return {
      type: 'FeatureCollection',
      features,
    }
  }, [robots, selectedRobotId, trailsByRobot])

  const geofenceDataRef = useRef(geofenceData)
  const layoutDataRef = useRef(layoutData)
  const roadsDataRef = useRef(roadsData)
  const trailDataRef = useRef(trailData)
  const targetLinkDataRef = useRef(targetLinkData)
  const targetFlagPoleDataRef = useRef(targetFlagPoleData)
  const targetFlagBodyDataRef = useRef(targetFlagBodyData)
  const robotDataRef = useRef(robotData)

  useEffect(() => {
    geofenceDataRef.current = geofenceData
  }, [geofenceData])
  useEffect(() => {
    layoutDataRef.current = layoutData
  }, [layoutData])
  useEffect(() => {
    roadsDataRef.current = roadsData
  }, [roadsData])
  useEffect(() => {
    trailDataRef.current = trailData
  }, [trailData])
  useEffect(() => {
    targetLinkDataRef.current = targetLinkData
  }, [targetLinkData])
  useEffect(() => {
    targetFlagPoleDataRef.current = targetFlagPoleData
  }, [targetFlagPoleData])
  useEffect(() => {
    targetFlagBodyDataRef.current = targetFlagBodyData
  }, [targetFlagBodyData])
  useEffect(() => {
    robotDataRef.current = robotData
  }, [robotData])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return
    }

    let map: MapLibreMap

    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: 'delivery-base-background',
              type: 'background',
              paint: {
                'background-color': '#111f2a',
              },
            },
          ],
        },
        center: deliveryPointToLngLat({ x: 50, y: 50 }),
        zoom: 13.25,
        minZoom: 11.5,
        maxZoom: 16.8,
        attributionControl: false,
      })
    } catch (error) {
      console.error('[live-map] map initialization failed', error)
      requestAnimationFrame(() => {
        setMapError('Map initialization failed')
      })
      return
    }

    mapRef.current = map

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('error', () => {
      setMapError('Map render error')
    })

    map.on('load', () => {
      const syncSources = () => {
        setSourceData(map, MAP_SOURCE_IDS.layout, layoutDataRef.current)
        setSourceData(map, MAP_SOURCE_IDS.roads, roadsDataRef.current)
        setSourceData(map, MAP_SOURCE_IDS.geofences, geofenceDataRef.current)
        setSourceData(map, MAP_SOURCE_IDS.trails, trailDataRef.current)
        setSourceData(map, MAP_SOURCE_IDS.targetLinks, targetLinkDataRef.current)
        setSourceData(map, MAP_SOURCE_IDS.targetFlagPoles, targetFlagPoleDataRef.current)
        setSourceData(map, MAP_SOURCE_IDS.targetFlagBodies, targetFlagBodyDataRef.current)
        setSourceData(map, MAP_SOURCE_IDS.robots, robotDataRef.current)
      }

      map.addSource(MAP_SOURCE_IDS.layout, {
        type: 'geojson',
        data: layoutDataRef.current,
      })
      map.addLayer({
        id: MAP_LAYER_IDS.layoutFill,
        type: 'fill',
        source: MAP_SOURCE_IDS.layout,
        paint: {
          'fill-color': '#1f3342',
          'fill-opacity': 0.65,
        },
      })
      map.addLayer({
        id: MAP_LAYER_IDS.layoutLine,
        type: 'line',
        source: MAP_SOURCE_IDS.layout,
        paint: {
          'line-color': '#2f526e',
          'line-width': 1.25,
          'line-opacity': 0.9,
        },
      })

      map.addSource(MAP_SOURCE_IDS.roads, {
        type: 'geojson',
        data: roadsDataRef.current,
      })
      map.addLayer({
        id: MAP_LAYER_IDS.roads,
        type: 'line',
        source: MAP_SOURCE_IDS.roads,
        paint: {
          'line-color': '#5f7f97',
          'line-width': 3,
          'line-opacity': 0.72,
        },
      })

      map.addSource(MAP_SOURCE_IDS.raster, {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors',
      })
      map.addLayer({
        id: MAP_LAYER_IDS.raster,
        type: 'raster',
        source: MAP_SOURCE_IDS.raster,
        paint: {
          'raster-opacity': 0.9,
          'raster-saturation': -0.3,
          'raster-contrast': 0.08,
        },
      })

      map.addSource(MAP_SOURCE_IDS.geofences, {
        type: 'geojson',
        data: geofenceDataRef.current,
      })
      map.addLayer({
        id: MAP_LAYER_IDS.geofenceFill,
        type: 'fill',
        source: MAP_SOURCE_IDS.geofences,
        paint: {
          'fill-color': '#63b4ff',
          'fill-opacity': 0.12,
        },
      })
      map.addLayer({
        id: MAP_LAYER_IDS.geofenceLine,
        type: 'line',
        source: MAP_SOURCE_IDS.geofences,
        paint: {
          'line-color': '#8ed1ff',
          'line-width': 1.6,
          'line-opacity': 0.85,
        },
      })

      map.addSource(MAP_SOURCE_IDS.trails, {
        type: 'geojson',
        data: trailDataRef.current,
      })
      map.addLayer({
        id: MAP_LAYER_IDS.trails,
        type: 'line',
        source: MAP_SOURCE_IDS.trails,
        paint: {
          'line-color': [
            'match',
            ['get', 'status'],
            'IDLE',
            statusHexByRobotStatus.IDLE,
            'ON_MISSION',
            statusHexByRobotStatus.ON_MISSION,
            'NEED_ASSIST',
            statusHexByRobotStatus.NEED_ASSIST,
            'FAULT',
            statusHexByRobotStatus.FAULT,
            'OFFLINE',
            statusHexByRobotStatus.OFFLINE,
            '#93a1b4',
          ],
          'line-width': ['case', ['boolean', ['get', 'selected'], false], 3.2, 2],
          'line-opacity': 0.7,
        },
      })

      map.addSource(MAP_SOURCE_IDS.targetLinks, {
        type: 'geojson',
        data: targetLinkDataRef.current,
      })
      map.addLayer({
        id: MAP_LAYER_IDS.targetLinks,
        type: 'line',
        source: MAP_SOURCE_IDS.targetLinks,
        paint: {
          'line-color': '#3f2f12',
          'line-width': ['case', ['boolean', ['get', 'selected'], false], 2.8, 1.8],
          'line-opacity': ['case', ['boolean', ['get', 'selected'], false], 0.92, 0.6],
          'line-dasharray': [2, 2],
        },
      })

      map.addSource(MAP_SOURCE_IDS.targetFlagPoles, {
        type: 'geojson',
        data: targetFlagPoleDataRef.current,
      })
      map.addLayer({
        id: MAP_LAYER_IDS.targetFlagPoles,
        type: 'line',
        source: MAP_SOURCE_IDS.targetFlagPoles,
        layout: {
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#1f2d3b',
          'line-width': ['case', ['boolean', ['get', 'selected'], false], 2.9, 2.1],
          'line-opacity': 0.92,
        },
      })

      map.addSource(MAP_SOURCE_IDS.targetFlagBodies, {
        type: 'geojson',
        data: targetFlagBodyDataRef.current,
      })
      map.addLayer({
        id: MAP_LAYER_IDS.targetFlagBodies,
        type: 'fill',
        source: MAP_SOURCE_IDS.targetFlagBodies,
        paint: {
          'fill-color': '#5a451a',
          'fill-outline-color': '#1f2d3b',
          'fill-opacity': ['case', ['boolean', ['get', 'selected'], false], 0.94, 0.82],
        },
      })

      map.addSource(MAP_SOURCE_IDS.robots, {
        type: 'geojson',
        data: robotDataRef.current,
      })
      map.addLayer({
        id: MAP_LAYER_IDS.robots,
        type: 'circle',
        source: MAP_SOURCE_IDS.robots,
        paint: {
          'circle-color': [
            'match',
            ['get', 'status'],
            'IDLE',
            statusHexByRobotStatus.IDLE,
            'ON_MISSION',
            statusHexByRobotStatus.ON_MISSION,
            'NEED_ASSIST',
            statusHexByRobotStatus.NEED_ASSIST,
            'FAULT',
            statusHexByRobotStatus.FAULT,
            'OFFLINE',
            statusHexByRobotStatus.OFFLINE,
            '#93a1b4',
          ],
          'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 8.5, 6.5],
          'circle-stroke-width': 1.8,
          'circle-stroke-color': '#0f1a24',
        },
      })

      map.on('mouseenter', MAP_LAYER_IDS.robots, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', MAP_LAYER_IDS.robots, () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('mouseenter', MAP_LAYER_IDS.targetFlagBodies, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', MAP_LAYER_IDS.targetFlagBodies, () => {
        map.getCanvas().style.cursor = ''
      })

      map.on('click', MAP_LAYER_IDS.robots, (event) => {
        const clickedFeature = event.features?.[0]
        const robotId = clickedFeature?.properties?.robotId
        if (typeof robotId === 'string') {
          onSelectRobotRef.current(robotId)
        }
      })
      map.on('click', MAP_LAYER_IDS.targetFlagBodies, (event) => {
        const clickedFeature = event.features?.[0]
        const robotId = clickedFeature?.properties?.robotId
        if (typeof robotId === 'string') {
          onSelectRobotRef.current(robotId)
        }
      })

      map.on('click', (event) => {
        const features = map.queryRenderedFeatures(event.point, {
          layers: [MAP_LAYER_IDS.robots, MAP_LAYER_IDS.targetFlagBodies],
        })

        if (features.length === 0) {
          onSelectRobotRef.current(null)
        }
      })

      readyRef.current = true
      setIsMapLoaded(true)
      syncSources()
      map.resize()
      requestAnimationFrame(() => {
        map.resize()
      })
    })

    return () => {
      readyRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) {
      return
    }

    setSourceData(map, MAP_SOURCE_IDS.layout, layoutData)
    setSourceData(map, MAP_SOURCE_IDS.roads, roadsData)
    setSourceData(map, MAP_SOURCE_IDS.geofences, geofenceData)
    setSourceData(map, MAP_SOURCE_IDS.trails, trailData)
    setSourceData(map, MAP_SOURCE_IDS.targetLinks, targetLinkData)
    setSourceData(map, MAP_SOURCE_IDS.targetFlagPoles, targetFlagPoleData)
    setSourceData(map, MAP_SOURCE_IDS.targetFlagBodies, targetFlagBodyData)
    setSourceData(map, MAP_SOURCE_IDS.robots, robotData)
  }, [geofenceData, layoutData, roadsData, robotData, targetLinkData, targetFlagPoleData, targetFlagBodyData, trailData])

  useEffect(() => {
    const map = mapRef.current
    const container = containerRef.current
    if (!map || !container || typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => {
      map.resize()
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <div className="relative h-[560px] overflow-hidden rounded-panel border border-border/70 bg-surface">
      <svg
        className="absolute inset-0 z-0 h-full w-full"
        onClick={() => onSelectRobot(null)}
        viewBox="0 0 960 560"
      >
        <rect fill="hsl(var(--ui-color-bg) / 0.86)" height="560" width="960" x="0" y="0" />

        {cityBlocks.map((block) => {
          const points = block.points
            .map((point) => {
              const svgPoint = deliveryPointToSvg(point)
              return `${svgPoint.x},${svgPoint.y}`
            })
            .join(' ')

          return (
            <polygon
              fill="hsl(var(--ui-color-surface-elevated) / 0.52)"
              key={block.id}
              points={points}
              stroke="hsl(var(--ui-color-border) / 0.75)"
              strokeWidth="1.25"
            />
          )
        })}

        {roadSegments.map((segment) => {
          const points = segment.points
            .map((point) => {
              const svgPoint = deliveryPointToSvg(point)
              return `${svgPoint.x},${svgPoint.y}`
            })
            .join(' ')

          return (
            <polyline
              fill="none"
              key={segment.id}
              points={points}
              stroke="hsl(var(--ui-color-accent) / 0.42)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="4"
            />
          )
        })}

        {geofencePolygons.map((zone) => {
          const points = zone.points
            .map((point) => {
              const svgPoint = deliveryPointToSvg(point)
              return `${svgPoint.x},${svgPoint.y}`
            })
            .join(' ')

          return (
            <polygon
              fill="hsl(var(--ui-color-accent-soft) / 0.2)"
              key={zone.id}
              points={points}
              stroke="hsl(var(--ui-color-accent) / 0.65)"
              strokeDasharray="6 8"
              strokeWidth="1.5"
            />
          )
        })}

        {robots.map((robot) => {
          const trail = trailsByRobot[robot.robotId] ?? []
          if (trail.length < 2) {
            return null
          }

          const points = trail
            .map((point) => {
              const svgPoint = deliveryPointToSvg(point)
              return `${svgPoint.x},${svgPoint.y}`
            })
            .join(' ')

          return (
            <polyline
              fill="none"
              key={`fallback-trail-${robot.robotId}`}
              points={points}
              stroke={statusHexByRobotStatus[robot.status]}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={selectedRobotId === robot.robotId ? 1 : 0.68}
              strokeWidth={selectedRobotId === robot.robotId ? 3.4 : 2.2}
            />
          )
        })}

        {missionTargets.map((target) => {
          const point = deliveryPointToSvg(target.target)
          const robotPoint = robotPoseById.get(target.robotId)
          const robotSvgPoint = robotPoint ? deliveryPointToSvg(robotPoint) : null
          const isSelected = selectedRobotId === target.robotId
          return (
            <g
              key={`fallback-target-${target.robotId}`}
              onClick={(event) => {
                event.stopPropagation()
                onSelectRobot(target.robotId)
              }}
            >
              {robotSvgPoint ? (
                <line
                  stroke="#3f2f12"
                  strokeDasharray="5 5"
                  strokeOpacity={selectedRobotId === target.robotId ? 0.92 : 0.6}
                  strokeWidth={selectedRobotId === target.robotId ? 2.8 : 1.8}
                  x1={robotSvgPoint.x}
                  x2={point.x}
                  y1={robotSvgPoint.y}
                  y2={point.y}
                />
              ) : null}
              <line
                stroke="#1f2d3b"
                strokeLinecap="round"
                strokeWidth={isSelected ? 3.2 : 2.4}
                x1={point.x}
                x2={point.x}
                y1={point.y}
                y2={point.y - 16}
              />
              <polygon
                className="cursor-pointer"
                fill="#5a451a"
                opacity={isSelected ? 0.94 : 0.82}
                points={`${point.x},${point.y - 16} ${point.x + 14},${point.y - 20} ${point.x},${point.y - 25}`}
                stroke="#1f2d3b"
                strokeWidth={isSelected ? 2.1 : 1.5}
              />
              <text
                fill="hsl(var(--ui-color-text) / 0.88)"
                fontFamily="var(--ui-font-body)"
                fontSize="9"
                textAnchor="start"
                x={point.x + 8}
                y={point.y - 20}
              >
                {`target ${target.robotId}`}
              </text>
            </g>
          )
        })}

        {robots.map((robot) => {
          const point = deliveryPointToSvg(robot.pose)
          const isSelected = selectedRobotId === robot.robotId
          return (
            <g
              className="cursor-pointer"
              key={`fallback-robot-${robot.robotId}`}
              onClick={(event) => {
                event.stopPropagation()
                onSelectRobot(robot.robotId)
              }}
            >
              <circle
                cx={point.x}
                cy={point.y}
                fill={statusHexByRobotStatus[robot.status]}
                r={isSelected ? 8.8 : 6.8}
                stroke="#0f1a24"
                strokeWidth="1.8"
              />
              <text
                fill="hsl(var(--ui-color-text) / 0.88)"
                fontFamily="var(--ui-font-body)"
                fontSize="9.5"
                textAnchor="middle"
                x={point.x}
                y={point.y - 10}
              >
                {robot.robotId}
              </text>
            </g>
          )
        })}
      </svg>

      <div
        className={[
          'absolute inset-0 z-10 transition-opacity duration-300',
          isMapLoaded ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        ref={containerRef}
      />
      <div className="map-overlay-surface absolute left-3 top-3 px-3 py-2 text-xs">
        Delivery geofences and robot trails
      </div>
      <div className="map-overlay-surface absolute right-3 top-3 px-3 py-2 text-xs text-muted">
        MapLibre: {isMapLoaded ? 'ready' : 'fallback'}
      </div>
      {mapError ? (
        <div className="map-overlay-surface absolute bottom-3 left-3 px-3 py-2 text-xs text-status-fault">
          {mapError}
        </div>
      ) : null}
      {!mapError && !isMapLoaded ? (
        <div className="map-overlay-surface absolute bottom-3 left-3 px-3 py-2 text-xs text-muted">
          Initializing delivery map...
        </div>
      ) : null}
    </div>
  )
}
