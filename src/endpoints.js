// Route map for the dashboard.
// The router (port 8000) is the single entry point for everything —
// control, SSE/MJPEG relays, and the HLS/WHEP streaming relays.
// Only WebRTC media (UDP 8189) bypasses it.

import network from '../config/network.json'

const MEWLY_HOST_STORAGE_KEY = 'mewly_host'
const PORT = network.backendPort

function hasWindow() {
  return typeof window !== 'undefined'
}

function normalizeHost(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    return new URL(raw.includes('://') ? raw : `http://${raw}`).hostname
  } catch {
    return raw.replace(/^https?:\/\//, '').split('/')[0].split(':')[0]
  }
}

function getStoredMewlyHost() {
  if (!hasWindow()) return ''
  return normalizeHost(window.localStorage.getItem(MEWLY_HOST_STORAGE_KEY))
}

// @claude Host typed on the login page for the current page load. Kept in memory so the
// @claude login request can target it before the host is known to be reachable;
// @claude persistMewlyHost() writes it to localStorage only after the backend responds.
let sessionMewlyHost = ''

function getMewlyHost() {
  return sessionMewlyHost || getStoredMewlyHost() || getBrowserHost()
}

function getApiUrl(path) {
  return `http://${getMewlyHost()}:${PORT}${path}`
}

export const API_ENDPOINTS = {
  get login() {
    return getApiUrl('/api/login')
  },
  get refresh() {
    return getApiUrl('/api/refresh')
  },
  get logout() {
    return getApiUrl('/api/logout')
  },
  get changePassword() {
    return getApiUrl('/api/change-password')
  },
  get camera() {
    return getApiUrl('/camera')
  },
  get clips() {
    return getApiUrl('/clips')
  },
  // @claude recorder 이벤트 이력(FR-031) 조회 — SSE의 APP_ENDPOINTS.events(/state)와
  // @claude 별개 자원이므로 이름을 eventHistory로 구분한다.
  get eventHistory() {
    return getApiUrl('/events')
  },
  // recorder 집계(3층) 조회 — 버킷별 라벨 발생 수와 분모(total)
  get summary() {
    return getApiUrl('/summary')
  },
  clipFile(name) {
    return getApiUrl(`/clips/${encodeURIComponent(name)}`)
  },
}

export const APP_ENDPOINTS = {
  get prompt() {
    return getApiUrl('/prompt')
  },
  get ptz() {
    return getApiUrl('/ptz')
  },
  get analysisStart() {
    return getApiUrl('/analysis/start')
  },
  get analysisStop() {
    return getApiUrl('/analysis/stop')
  },
  get streamingStart() {
    return getApiUrl('/streaming/start')
  },
  get streamingStop() {
    return getApiUrl('/streaming/stop')
  },
  // @claude Live state SSE. The router path is /state (its /events carries the
  // @claude stored event history).
  get events() {
    return getApiUrl('/state')
  },
  get mjpeg() {
    return getApiUrl('/stream')
  },
  // analyzer 라벨 어휘·시간 구간 프리셋 주입(2층)
  get presets() {
    return getApiUrl('/presets')
  },
  get vlmSwitch() {
    return getApiUrl('/vlm/switch')
  },
}

export function getBrowserHost() {
  return window.location.hostname
}

export function getEditableMewlyHost() {
  return sessionMewlyHost || getStoredMewlyHost() || (hasWindow() ? getBrowserHost() : '')
}

// @claude Activate a host for the current page load without persisting it. The login
// @claude request targets this value; call persistMewlyHost() once the backend responds.
export function applyMewlyHost(host) {
  sessionMewlyHost = normalizeHost(host)
  return sessionMewlyHost
}

// @claude Persist the active host once the backend has responded (i.e. the host is
// @claude reachable). An empty host clears the stored value so resolution falls back
// @claude to the browser host.
export function persistMewlyHost() {
  if (!hasWindow()) return
  if (sessionMewlyHost) {
    window.localStorage.setItem(MEWLY_HOST_STORAGE_KEY, sessionMewlyHost)
  } else {
    window.localStorage.removeItem(MEWLY_HOST_STORAGE_KEY)
  }
}

export function getStreamHost() {
  return getMewlyHost()
}

// @claude HLS and WHEP go through the router relay (single entry). Only the
// @claude WebRTC media itself flows directly from the streamer (UDP 8189).
export function getHlsUrl(host = getStreamHost()) {
  return `http://${host}:${PORT}/live/hls/index.m3u8`
}

export function getWhepUrl(host = getStreamHost()) {
  return `http://${host}:${PORT}/live/whep`
}

export function getEventsUrl(token) {
  return `${APP_ENDPOINTS.events}?token=${encodeURIComponent(token)}`
}

export function getClipUrl(name, size, token) {
  return `${API_ENDPOINTS.clipFile(name)}?s=${size}&token=${encodeURIComponent(token)}`
}
