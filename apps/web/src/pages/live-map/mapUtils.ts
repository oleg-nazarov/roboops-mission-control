import type { RobotStatus } from '@roboops/contracts'
import type { SimPoint } from './types'

const deliveryBounds = {
  minLon: -122.432,
  maxLon: -122.372,
  minLat: 37.758,
  maxLat: 37.806,
}

export const deliveryPointToLngLat = (point: SimPoint): [number, number] => {
  const lon =
    deliveryBounds.minLon + (point.x / 100) * (deliveryBounds.maxLon - deliveryBounds.minLon)
  const lat =
    deliveryBounds.minLat + (point.y / 100) * (deliveryBounds.maxLat - deliveryBounds.minLat)
  return [lon, lat]
}

export const warehousePointToSvg = (
  point: SimPoint,
): {
  x: number
  y: number
} => ({
  x: 60 + point.x * 8.8,
  y: 560 - point.y * 4.9,
})

export const statusHexByRobotStatus: Record<RobotStatus, string> = {
  IDLE: '#68c07a',
  ON_MISSION: '#3ba3ff',
  NEED_ASSIST: '#f5b545',
  FAULT: '#e35f5f',
  OFFLINE: '#7d8ca1',
}
