import { ref } from 'vue'
import ptz from '../../config/ptz.json'
import { authFetch } from './useFetch.js'
import { APP_ENDPOINTS } from '../endpoints.js'

// @claude ONVIF velocity is normalized to [-1, 1]; the three levels map the
// @claude mockup's 저속·보통·고속 onto it. The backend passes values through.
const SPEED_FACTORS = ptz.speedFactors

const speedLevel = ref(1)

async function post(body) {
  try {
    const res = await authFetch(APP_ENDPOINTS.ptz, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

function startMove(pan, tilt) {
  const factor = SPEED_FACTORS[speedLevel.value] ?? SPEED_FACTORS[1]
  post({ action: 'move', pan: pan * factor, tilt: tilt * factor })
}

function stopMove() {
  post({ action: 'stop' })
}

function setSpeedLevel(level) {
  if (level >= 0 && level < SPEED_FACTORS.length) speedLevel.value = level
}

async function savePreset(slot) {
  const data = await post({ action: 'save', slot })
  return !!data?.ok
}

async function gotoPreset(slot) {
  const data = await post({ action: 'goto', slot })
  return !!data?.ok
}

// 지정 좌표(ONVIF 정규화 공간 -1~1)로 절대 이동 (FR-016).
async function moveAbsolute(pan, tilt) {
  const data = await post({ action: 'absolute', pan, tilt })
  return !!data?.ok
}

// 자동 순찰 설정 (FR-052). 결과 상태는 SSE의 ptz_patrol로 내려온다.
async function setPatrol(enabled, intervalSec) {
  const body = { action: 'patrol', enabled }
  if (intervalSec != null) body.interval_s = intervalSec
  const data = await post(body)
  return !!data?.ok
}

export function usePtz() {
  return { speedLevel, setSpeedLevel, startMove, stopMove, moveAbsolute, savePreset, gotoPreset, setPatrol }
}
