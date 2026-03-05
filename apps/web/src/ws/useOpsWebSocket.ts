import { startTransition, useCallback, useEffect, useRef } from 'react'
import type { OpsMode as ContractOpsMode, WsClientMessage } from '@roboops/contracts'
import { wsClientMessageSchema, wsServerMessageSchema } from '@roboops/contracts'
import { useAppStore, type OpsMode } from '../state/appStore'

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

const disposeSocket = (socket: WebSocket): void => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.close(1000, 'client cleanup')
    return
  }

  if (socket.readyState === WebSocket.CONNECTING) {
    socket.addEventListener(
      'open',
      () => {
        socket.close(1000, 'client cleanup')
      },
      { once: true },
    )
  }
}

export const useOpsWebSocket = () => {
  const wsUrl = (() => {
    if (typeof import.meta.env.VITE_SIM_WS_URL === 'string' && import.meta.env.VITE_SIM_WS_URL.trim()) {
      return import.meta.env.VITE_SIM_WS_URL.trim()
    }

    if (typeof window !== 'undefined') {
      const isLocalHost =
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      if (isLocalHost) {
        return 'ws://localhost:8090'
      }

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      return `${wsProtocol}//${window.location.host}/ws`
    }

    return 'ws://localhost:8090'
  })()

  const setWsStatus = useAppStore((state) => state.setWsStatus)
  const setWsUrl = useAppStore((state) => state.setWsUrl)
  const setWsError = useAppStore((state) => state.setWsError)
  const applyWsMessages = useAppStore((state) => state.applyWsMessages)

  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const pingTimerRef = useRef<number | null>(null)
  const flushFrameRef = useRef<number | null>(null)
  const queuedMessagesRef = useRef<ReturnType<typeof wsServerMessageSchema.parse>[]>([])
  const shouldReconnectRef = useRef(true)

  const flushQueuedMessages = useCallback(() => {
    flushFrameRef.current = null
    if (queuedMessagesRef.current.length === 0) {
      return
    }

    const payload = queuedMessagesRef.current
    queuedMessagesRef.current = []
    startTransition(() => {
      applyWsMessages(payload)
    })
  }, [applyWsMessages])

  const enqueueWsMessage = useCallback(
    (message: ReturnType<typeof wsServerMessageSchema.parse>) => {
      queuedMessagesRef.current.push(message)
      if (flushFrameRef.current !== null) {
        return
      }

      flushFrameRef.current = window.requestAnimationFrame(() => {
        flushQueuedMessages()
      })
    },
    [flushQueuedMessages],
  )

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

          enqueueWsMessage(parsedMessage.data)
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
      if (flushFrameRef.current !== null) {
        window.cancelAnimationFrame(flushFrameRef.current)
        flushFrameRef.current = null
      }
      queuedMessagesRef.current = []
      const socket = socketRef.current
      socketRef.current = null
      if (socket) {
        disposeSocket(socket)
      }
      setWsStatus('idle')
    }
  }, [
    applyWsMessages,
    clearPingTimer,
    clearReconnectTimer,
    enqueueWsMessage,
    flushQueuedMessages,
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
