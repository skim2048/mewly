import { ref } from 'vue'
import network from '../../config/network.json'

// @claude The protocol pill lives in the dashboard top bar (mockup) while the
// @claude player consuming it lives in LiveStream, so the preference is shared
// @claude module state rather than component state.
const DEFAULT_STREAM_PROTOCOL = network.stream.defaultProtocol
const STREAM_PROTOCOL_STORAGE_KEY = 'mewly_stream_protocol'
const STREAM_PROTOCOLS = ['hls', 'webrtc']

function readStoredProtocol() {
  if (typeof window === 'undefined') return DEFAULT_STREAM_PROTOCOL
  try {
    const value = window.localStorage.getItem(STREAM_PROTOCOL_STORAGE_KEY)
    return STREAM_PROTOCOLS.includes(value) ? value : DEFAULT_STREAM_PROTOCOL
  } catch {
    return DEFAULT_STREAM_PROTOCOL
  }
}

function writeStoredProtocol(protocol) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STREAM_PROTOCOL_STORAGE_KEY, protocol)
  } catch {
    // Browser storage can be unavailable in restricted contexts; keep runtime selection.
  }
}

const preferredProtocol = ref(readStoredProtocol())

export function useStreamProtocol() {
  function setProtocol(protocol) {
    if (!STREAM_PROTOCOLS.includes(protocol) || preferredProtocol.value === protocol) return
    preferredProtocol.value = protocol
    writeStoredProtocol(protocol)
  }

  return { preferredProtocol, setProtocol, protocols: STREAM_PROTOCOLS }
}
