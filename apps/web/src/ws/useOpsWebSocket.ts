import { useCallback, useEffect, useRef } from 'react'
import type { OpsMode as ContractOpsMode, WsClientMessage } from '@roboops/contracts'
import { wsClientMessageSchema, wsServerMessageSchema } from '@roboops/contracts'
import { useAppStore, type OpsMode } from '../state/appStore'

const DEFAULT_WS_URL = 'ws://localhost:8090'
const RECONNECT_DELAY_MS = 1500
const CLIENT_PING_INTERVAL_MS = 5000

const toContractMode = (mode: OpsMode): ContractOpsMode =>
  mode === 'delivery' ? 'DELIVERY' : 'WAREHOUSE'

const decodeServerPayload = (raw: unknown): string | null => {
  if (typeof raw === 'string') {
    return raw
  }

  if (raw instanceof ArrayBuffer) {
    const decoder = new TextDecoder()
    return decoder.decode(raw)
  }

  return null
}

export const useOpsWebSocket = () => {
  const wsUrl =
    (typeof import.meta.env.VITE_SIM_WS_URL === 'string' && import.meta.env.VITE_SIM_WS_URL.trim()) ||
    DEFAULT_WS_URL

  const setWsStatus = useAppStore((state) => state.setWsStatus)
  const setWsUrl = useAppStore((state) => state.setWsUrl)
  const setWsError = useAppStore((state) => state.setWsError)
  const applyWsMessage = useAppStore((state) => state.applyWsMessage)

  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const pingTimerRef = useRef<number | null>(null)
  const shouldReconnectRef = useRef(true)

  const clearPingTimer = useCallback(() => {
    if (pingTimerRef.current === null) {
      return
    }

    window.clearInterval(pingTimerRef.current)
    pingTimerRef.current = null
  }, [])

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current === null) {
      return
    }

    window.clearTimeout(reconnectTimerRef.current)
    reconnectTimerRef.current = null
  }, [])

  const sendClientMessage = useCallback((message: WsClientMessage) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return
    }

    const validMessage = wsClientMessageSchema.parse(message)
    socket.send(JSON.stringify(validMessage))
  }, [])

  const sendSetModeCommand = useCallback(
    (mode: OpsMode) => {
      sendClientMessage({
        type: 'set_mode',
        mode: toContractMode(mode),
      })
    },
    [sendClientMessage],
  )

  useEffect(() => {
    shouldReconnectRef.current = true
    setWsUrl(wsUrl)

    const connect = () => {
      const hadSession = useAppStore.getState().ws.lastServerTs !== null
      setWsStatus(hadSession ? 'reconnecting' : 'connecting')

      const socket = new WebSocket(wsUrl)
      socketRef.current = socket

      socket.onopen = () => {
        if (socketRef.current !== socket) {
          return
        }

        setWsStatus('connected')
        setWsError(null)

        const lastStreamSeq = useAppStore.getState().ws.lastStreamSeq
        if (lastStreamSeq > 0) {
          sendClientMessage({ type: 'resume', lastStreamSeq })
        }

        sendClientMessage({ type: 'ping', clientTs: Date.now() })
        clearPingTimer()
        pingTimerRef.current = window.setInterval(() => {
          sendClientMessage({ type: 'ping', clientTs: Date.now() })
        }, CLIENT_PING_INTERVAL_MS)
      }

      socket.onmessage = (event) => {
        if (socketRef.current !== socket) {
          return
        }

        const rawText = decodeServerPayload(event.data)
        if (!rawText) {
          setWsError('Unsupported WebSocket payload type')
          return
        }

        try {
          const parsedJson = JSON.parse(rawText) as unknown
          const parsedMessage = wsServerMessageSchema.safeParse(parsedJson)
          if (!parsedMessage.success) {
            setWsError('Invalid WebSocket payload dropped by validator')
            return
          }

          applyWsMessage(parsedMessage.data)
        } catch {
          setWsError('Malformed WebSocket JSON payload')
        }
      }

      socket.onerror = () => {
        if (socketRef.current !== socket) {
          return
        }

        setWsStatus('error')
        setWsError('WebSocket transport error')
      }

      socket.onclose = (event) => {
        if (socketRef.current !== socket) {
          return
        }

        clearPingTimer()
        socketRef.current = null

        if (!shouldReconnectRef.current) {
          setWsStatus('idle')
          return
        }

        setWsStatus('reconnecting')
        setWsError(`Disconnected (code ${event.code})`)
        clearReconnectTimer()
        reconnectTimerRef.current = window.setTimeout(connect, RECONNECT_DELAY_MS)
      }
    }

    connect()

    return () => {
      shouldReconnectRef.current = false
      clearPingTimer()
      clearReconnectTimer()
      const socket = socketRef.current
      socketRef.current = null
      socket?.close()
      setWsStatus('idle')
    }
  }, [
    applyWsMessage,
    clearPingTimer,
    clearReconnectTimer,
    sendClientMessage,
    setWsError,
    setWsStatus,
    setWsUrl,
    wsUrl,
  ])

  return {
    wsUrl,
    sendSetModeCommand,
  }
}
