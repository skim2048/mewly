<script setup>
import { ref, computed, watch, onActivated, onMounted, onBeforeUnmount } from 'vue'
import { useCamera } from '../composables/useCamera.js'
import { useAuth } from '../composables/useAuth.js'
import { useLocale } from '../composables/useLocale.js'
import { useSSE } from '../composables/useSSE.js'
import { useStreamProtocol } from '../composables/useStreamProtocol.js'
import { useAnalysis } from '../composables/useAnalysis.js'
import { useInferLog } from '../composables/useInferLog.js'
import { useVlmStatus } from '../composables/useVlmStatus.js'
import { useStreamStats } from '../composables/useStreamStats.js'
import { usePtz } from '../composables/usePtz.js'
import { getHlsUrl, getWhepUrl, APP_ENDPOINTS } from '../endpoints.js'
import { authFetch } from '../composables/useFetch.js'
import { withDayHeaders } from '../composables/dates.js'
import { useToast } from '../composables/useToast.js'
import { persistentRef } from '../composables/storage.js'
import { useProfile } from '../composables/useProfile.js'
import { breedLabel } from '../composables/useProfile.js'
import { useSchedules } from '../composables/useSchedules.js'
import { useClips } from '../composables/useClips.js'
import { fetchDaySummary } from '../composables/useEventSummary.js'
import { toIsoDate } from '../composables/dates.js'
import { onBackButton } from '../native/backButton.js'
import { setStatusBarHidden } from '../native/init.js'
import network from '../../config/network.json'

const emit = defineEmits(['open-sheet', 'open-modal', 'open-overlay', 'go-tab'])

const { state: sseState } = useSSE()
const { t, locale } = useLocale()

const { accessToken } = useAuth()
const { configured, connecting, connected, ptzEnabled, setConnected, setDisconnected, disconnect } = useCamera()
const { analysisActive, busy: analysisBusy, toggle: toggleAnalysis } = useAnalysis()
const { entries: inferLog } = useInferLog()
const { vlmDot, vlmLabel, vlmKind } = useVlmStatus()
const { startMove, stopMove } = usePtz()
const { showToast } = useToast()

watch(accessToken, (currentToken) => {
  if (!currentToken) {
    handleDisconnect()
  }
})

watch(() => sseState.pipeline_state, (nextState, prevState) => {
  if (!configured.value || stopped.value) return
  if (nextState !== 'streaming' || !prevState || prevState === 'streaming') return
  if (loading.value) return
  schedulePipelineRecovery()
})

const videoRef = ref(null)
const loading = ref(false)
const stopped = ref(true)
const fullscreen = ref(false)
const fsLog = ref(true)

// @claude 기기 방향이 전체 화면을 자동 전환한다: 가로 → 진입, 세로 → 종료.
// @claude 버튼으로 한 수동 전환은 다음 방향 전환 때까지 유지된다.
let landscapeMq = null
function onOrientationChange(e) {
  fullscreen.value = e.matches
}

// @claude 가로 상태에서 축소하면 화면을 세로로 잠근다 — 기기가 가로여도
// @claude 일반 UI는 세로로 유지된다. 잠금은 다시 확대할 때 풀린다.
// @claude (브라우저에서는 lock이 전체 화면 밖에서 거부될 수 있어 무시한다.)
function enterFullscreen() {
  try { screen.orientation?.unlock?.() } catch {}
  fullscreen.value = true
}
function exitFullscreen() {
  fullscreen.value = false
  if (landscapeMq?.matches) {
    try { screen.orientation?.lock?.('portrait')?.catch?.(() => {}) } catch {}
  }
}

// @claude 풀스크린 공통 후처리 — 진입 경로가 둘(방향 전환·버튼)이라 watch로
// @claude 일원화한다: 상태바 숨김/복귀 + Android 뒤로가기로 이탈(소비).
let offFsBack = null
watch(fullscreen, (fs) => {
  setStatusBarHidden(fs)
  if (fs && !offFsBack) {
    offFsBack = onBackButton(() => { exitFullscreen(); return true })
  } else if (!fs && offFsBack) {
    offFsBack()
    offFsBack = null
  }
})

// ── VLM card ──
const modelMenu = ref(false)
const modelSwitching = ref(false)
// @claude 모델 id의 마지막 경로 조각만 표기한다
// @claude (예: Efficient-Large-Model/VILA1.5-3b → VILA1.5-3b).
function shortModelName(id) {
  if (!id) return ''
  const parts = id.split('/')
  return parts[parts.length - 1]
}
const modelLabel = computed(() =>
  shortModelName(sseState.vlm_current_model) || t('dashboard.model.unknown'),
)
async function switchModel(name) {
  modelMenu.value = false
  if (!name || name === sseState.vlm_current_model) return
  // 요청~SSE '전환 중' 반영 사이 공백을 busy로 메운다 (전수 조사 #10)
  modelSwitching.value = true
  try {
    await authFetch(APP_ENDPOINTS.vlmSwitch, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: name }),
    })
  } catch {}
  modelSwitching.value = false
}

// @claude 거부되면(스트리밍 꺼짐) 사유 안내가 있는 프롬프트 모달을 연다.
async function onInferClick() {
  const ok = await toggleAnalysis()
  if (!ok) emit('open-modal', 'prompt')
}

// ── 추론 로그 — 시안: 날짜가 바뀌는 지점에만 구분선(오늘 생략·어제 문구·YY-MM-DD)
function annotateDays(list) {
  return withDayHeaders(list, (entry) => entry.day, (day, { isToday, isYesterday }) => {
    if (isToday) return null
    return isYesterday ? t('dashboard.day.yesterday') : day.slice(2)
  })
}

const logEntries = computed(() => annotateDays([...inferLog]))
// 아코디언(사용자 확정): VLM 카드 전체 — 접힘=상태+최신 로그 한 줄, 펼침=전체
const vlmOpen = persistentRef('homeVlmOpen', false)
const latestLog = computed(() => inferLog[0] ?? null)


// ── 기기 제어 버튼 (조명·온도·마이크는 목업, PTZ는 실동작) ──
const deviceButtons = [
  { key: 'light', icon: 'ph ph-lightbulb', label: () => t('dev.light') },
  { key: 'temp', icon: 'ph ph-thermometer-simple', label: () => t('dev.temp') },
  { key: 'mic', icon: 'ph ph-microphone', label: () => t('dev.mic') },
]

// ── 요약 대시보드 (VLM 카드 아래 — 프로필·오늘 일정·오늘 이벤트) ──
const { profile, ageText } = useProfile()
const { schedulesOn } = useSchedules()
const { clipVersion } = useClips()

const profileSub = computed(() => {
  const parts = [
    profile.value.breed && breedLabel(profile.value.breed, locale.value),
    ageText.value,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : t('profile.empty')
})

const todaySchedules = computed(() => schedulesOn(toIsoDate()))
const nextSchedule = computed(() => {
  const now = new Date()
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return todaySchedules.value.find((it) => !it.done && !it.allDay && it.time >= hhmm) ?? null
})
const scheduleSummary = computed(() => {
  const n = todaySchedules.value.length
  if (!n) return t('home.card.none')
  const count = t('home.card.n', { n })
  return nextSchedule.value ? `${count} · ${nextSchedule.value.time} ${nextSchedule.value.title}` : count
})

// 오늘 이벤트: /events 집계 재사용 (클립 변화 시 갱신)
const todayEvents = ref(null) // null=미적재 | { total, top }
async function loadTodayEvents() {
  if (!isAuthenticatedForSummary()) return
  try {
    const sum = await fetchDaySummary(toIsoDate())
    todayEvents.value = { total: sum.total, top: sum.cards[0]?.keyword ?? null }
  } catch { /* 홈 요약은 조용히 생략 — 상세 오류는 분석 탭이 담당 */ }
}
function isAuthenticatedForSummary() {
  return !!accessToken.value
}
watch(clipVersion, loadTodayEvents, { immediate: true })
const eventSummary = computed(() => {
  if (!todayEvents.value) return '—'
  const { total, top } = todayEvents.value
  if (!total) return t('home.card.none')
  const count = t('home.card.n', { n: total })
  return top ? `${count} · ${top}` : count
})

// ── 전체화면 PTZ 패드 (연속 이동: 누르는 동안 이동, 떼면 정지) ──
const PTZ_DIRS = {
  up: { pan: 0, tilt: 1 },
  down: { pan: 0, tilt: -1 },
  left: { pan: -1, tilt: 0 },
  right: { pan: 1, tilt: 0 },
}
const padPressing = ref(null)
// 방향 해제 → 노브 복귀 직후 STOP 자동 눌림 연출 (PTZ 시트와 동일)
const padStopFlash = ref(false)
let padFlashTimer1 = null
let padFlashTimer2 = null
function padFlashStop() {
  clearTimeout(padFlashTimer1)
  clearTimeout(padFlashTimer2)
  padFlashTimer1 = setTimeout(() => {
    padStopFlash.value = true
    padFlashTimer2 = setTimeout(() => { padStopFlash.value = false }, 180)
  }, 150)
}

function padDown(dir) {
  const d = PTZ_DIRS[dir]
  padPressing.value = dir
  startMove(d.pan, d.tilt)
}
function padUp() {
  if (padPressing.value == null) return
  padPressing.value = null
  stopMove()
  padFlashStop()
}
// @claude 시안: 전체화면에서 패드는 항상 표시하고, 조작 가능 조건(포트 입력
// @claude + 재생 중)이 아닐 때만 흐리게 둔다. 조건이 꺼지면 스텝 반복도 멈춘다.
// 순찰 중에는 전체화면 패드의 수동 조작도 차단한다 (사용자 확정)
const padActive = computed(() =>
  fullscreen.value && ptzEnabled.value && isPlaying.value && !sseState.ptz_patrol?.enabled,
)
watch(padActive, (active) => {
  if (!active) padUp()
})

// 전체화면 PTZ 오류 문구 자리(시안 요소) — 오류 배선 시 이 값을 채운다.
const fsPtzError = ref('')

// @claude 순찰 중 비활성 패드를 탭하면 사유를 토스트로 안내한다 (사용자 확정)
const patrolOn = computed(() => !!sseState.ptz_patrol?.enabled)

function onPadPress(dir) {
  if (padActive.value) {
    padDown(dir)
    return
  }
  if (patrolOn.value) showToast('patrolLock')
}

function onPadStopPress() {
  if (padActive.value) {
    padUp()
    stopMove()
    return
  }
  if (patrolOn.value) showToast('patrolLock')
}

// ── Stream (client/web LiveStream과 동일한 연결 논리) ──

let hls = null
let Hls = null
let stallTimer = null
let retryTimer = null
let pipelineRecoveryTimer = null
let pc = null
let sessionId = 0
const STALL_TIMEOUT = network.hls.stallTimeoutMs
const RETRY_BACKOFF = network.hls.retryBackoffMs

// @claude The preference is shared with the top bar's segmented control.
const { preferredProtocol } = useStreamProtocol()
const isWebRTC = computed(() => preferredProtocol.value === 'webrtc')
const isPlaying = computed(() => connected.value && !loading.value && !stopped.value)

watch(preferredProtocol, () => {
  if (stopped.value) return
  restartStream()
})

const { stats, startStats, stopStats } = useStreamStats({
  videoRef,
  isWebRTC,
  getPeerConnection: () => pc,
  getHlsInstance: () => hls,
})

const streamMeta = computed(() =>
  `${preferredProtocol.value.toUpperCase()} · ${stats.resolution || '–'} · ${stats.fps || 0} FPS`,
)

function handleConnect() {
  stopped.value = false
  connecting.value = true
  restartStream()
}

function handleDisconnect() {
  stopped.value = true
  destroyAll()
  disconnect()
}

function restartStream() {
  destroyAll()
  initStream()
}

function initStream() {
  if (isWebRTC.value) initWebRTC()
  else initHls()
}

function destroyAll() {
  sessionId++
  clearAllTimers()
  destroyHls()
  destroyWebRTC()
  stopStats()
  loading.value = false
}

function clearAllTimers() {
  if (stallTimer) { clearInterval(stallTimer); stallTimer = null }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  if (pipelineRecoveryTimer) { clearTimeout(pipelineRecoveryTimer); pipelineRecoveryTimer = null }
}

function browserPlaybackUnavailable() {
  return !configured.value || stopped.value || loading.value
}

function getVideoPlaybackStatus(referenceTime = null) {
  const video = videoRef.value
  if (browserPlaybackUnavailable()) return 'inactive'
  if (!video) return 'missing_video'
  if (video.ended) return 'ended'
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return 'not_ready'
  if (video.paused) return 'paused'
  if (referenceTime != null && video.currentTime <= referenceTime + 0.05) return 'stalled'
  return 'healthy'
}

function browserPlaybackNeedsReconnect(referenceTime = null) {
  const status = getVideoPlaybackStatus(referenceTime)
  return status !== 'healthy' && status !== 'inactive'
}

function clearVideoElementMedia() {
  const video = videoRef.value
  if (!video) return
  video.pause()
  video.srcObject = null
  video.removeAttribute('src')
  video.load()
}

function schedulePipelineRecovery() {
  const baselineTime = videoRef.value?.currentTime ?? null
  if (pipelineRecoveryTimer) clearTimeout(pipelineRecoveryTimer)
  pipelineRecoveryTimer = setTimeout(() => {
    pipelineRecoveryTimer = null
    if (!browserPlaybackNeedsReconnect(baselineTime)) return
    restartStream()
  }, 1250)
}

// ── HLS ──

async function ensureHls() {
  if (Hls) return Hls
  const mod = await import('hls.js/light')
  Hls = mod.default
  return Hls
}

async function initHls() {
  const mySession = ++sessionId
  clearAllTimers()
  destroyHls()
  destroyWebRTC()
  loading.value = true

  const video = videoRef.value
  if (!video) return

  const HlsLib = await ensureHls().catch(() => null)
  if (mySession !== sessionId) return

  if (HlsLib && HlsLib.isSupported()) {
    hls = new HlsLib({
      liveSyncDurationCount: 1,
      liveMaxLatencyDurationCount: 3,
      maxBufferLength: 3,
      maxMaxBufferLength: 6,
      // @claude The HLS relay sits behind the router and every request —
      // @claude playlist and segments alike — must carry the access token.
      xhrSetup: (xhr) => {
        if (accessToken.value) xhr.setRequestHeader('Authorization', `Bearer ${accessToken.value}`)
      },
    })
    hls.loadSource(getHlsUrl())
    hls.attachMedia(video)
    hls.on(HlsLib.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}) })
    hls.on(HlsLib.Events.ERROR, (_, data) => {
      if (!data.fatal || mySession !== sessionId) return
      retryTimer = setTimeout(() => {
        if (mySession === sessionId) initHls()
      }, RETRY_BACKOFF)
    })
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // @claude Native HLS cannot set headers; the token rides the playlist URL.
    // @claude Segment requests do not inherit it, so native-only browsers are
    // @claude limited — hls.js above is the supported path.
    video.src = `${getHlsUrl()}?token=${encodeURIComponent(accessToken.value || '')}`
    video.addEventListener('loadedmetadata', () => { video.play().catch(() => {}) })
  }

  video.addEventListener('playing', onPlaying)
  startStallDetection(mySession)
}

function destroyHls() {
  const video = videoRef.value
  if (video) {
    video.removeEventListener('playing', onPlaying)
    video.src = ''
    video.load()
  }
  if (hls) { hls.destroy(); hls = null }
}

// ── WebRTC (WHEP) ──

function waitForIceGathering(peerConnection) {
  return new Promise((resolve) => {
    if (peerConnection.iceGatheringState === 'complete') { resolve(); return }
    peerConnection.addEventListener('icegatheringstatechange', function handler() {
      if (peerConnection.iceGatheringState === 'complete') {
        peerConnection.removeEventListener('icegatheringstatechange', handler)
        resolve()
      }
    })
  })
}

async function initWebRTC() {
  const mySession = ++sessionId
  clearAllTimers()
  destroyHls()
  destroyWebRTC()
  loading.value = true

  const video = videoRef.value
  if (!video) return

  try {
    pc = new RTCPeerConnection({ iceServers: [] })
    pc.addTransceiver('video', { direction: 'recvonly' })
    pc.addTransceiver('audio', { direction: 'recvonly' })

    pc.ontrack = (e) => {
      if (mySession !== sessionId) return
      if (e.streams && e.streams[0]) {
        video.srcObject = e.streams[0]
        video.play().catch(() => {})
      }
    }

    pc.onconnectionstatechange = () => {
      if (mySession !== sessionId || !pc) return
      const state = pc.connectionState
      if (state === 'connected') {
        onPlaying()
      } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        handleWebRTCConnectionLoss(mySession)
      }
    }

    const offer = await pc.createOffer()
    if (mySession !== sessionId) return
    await pc.setLocalDescription(offer)
    await waitForIceGathering(pc)
    if (mySession !== sessionId) return

    const res = await fetch(getWhepUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sdp',
        // @claude WHEP signaling passes the router relay and needs the token;
        // @claude the WebRTC media itself then flows directly (UDP 8890).
        ...(accessToken.value ? { Authorization: `Bearer ${accessToken.value}` } : {}),
      },
      body: pc.localDescription.sdp,
    })
    if (mySession !== sessionId) return
    if (!res.ok) throw new Error(`WHEP ${res.status}`)

    const answerSdp = await res.text()
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }))
  } catch (e) {
    if (mySession !== sessionId) return
    retryTimer = setTimeout(() => {
      if (mySession === sessionId) initWebRTC()
    }, RETRY_BACKOFF)
  }
}

function handleWebRTCConnectionLoss(mySession) {
  if (mySession !== sessionId) return
  clearVideoElementMedia()
  stopStats()
  setDisconnected()
  if (stopped.value) return
  loading.value = true
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = setTimeout(() => {
    if (mySession === sessionId) initWebRTC()
  }, RETRY_BACKOFF)
}

function destroyWebRTC() {
  if (pc) {
    pc.ontrack = null
    pc.onconnectionstatechange = null
    pc.close()
    pc = null
  }
  clearVideoElementMedia()
}

// ── Common handlers ──

function onPlaying() {
  loading.value = false
  setConnected()
  startStats()
}

function startStallDetection(mySession) {
  if (stallTimer) clearInterval(stallTimer)
  let lastTime = 0
  stallTimer = setInterval(() => {
    if (mySession !== sessionId) { clearInterval(stallTimer); stallTimer = null; return }
    const video = videoRef.value
    if (!video) return
    if (browserPlaybackNeedsReconnect(lastTime)) {
      restartStream()
      return
    }
    lastTime = video.currentTime
  }, STALL_TIMEOUT)
}

onMounted(() => {
  landscapeMq = window.matchMedia('(orientation: landscape)')
  landscapeMq.addEventListener('change', onOrientationChange)
  if (landscapeMq.matches) fullscreen.value = true
})

// @claude KeepAlive 탭 복귀 시 재생 재개. 탭 전환(v-if)은 DOM에서 <video>를
// @claude 떼어내는데, HTML 스펙상 문서에서 제거된 미디어 요소는 자동 pause된다 —
// @claude 연결(pc/hls)은 살아 있으므로 상태는 '연결됨'인데 화면만 멈춘다.
// @claude 복귀 시 play()로 재개하고, HLS는 라이브 엣지로 재동기화한다.
onActivated(() => {
  const video = videoRef.value
  if (!video || stopped.value) return
  if (hls && Number.isFinite(hls.liveSyncPosition)) {
    video.currentTime = hls.liveSyncPosition
  }
  if (video.paused) video.play().catch(() => {})
})

onBeforeUnmount(() => {
  landscapeMq?.removeEventListener('change', onOrientationChange)
  if (offFsBack) { offFsBack(); offFsBack = null }
  setStatusBarHidden(false)
  padUp()
  destroyAll()
})
</script>

<template>
  <div class="home-tab">

    <!-- ── Video (전체 화면 시 가로 회전 캔버스가 된다) ── -->
    <div class="video-wrap" :class="{ fs: fullscreen }">
      <div class="rotor">
        <div class="videobox">
          <video ref="videoRef" muted playsinline />

          <!-- 카메라 미등록: 안내만 표시 (시안: 비상호작용) -->
          <div v-if="!configured" class="video-overlay static">
            <i class="ph ph-video-camera-slash empty-icon"></i>
            <span class="overlay-text">{{ t('home.noCam') }}</span>
            <span class="overlay-hint">{{ t('home.noCamHint') }}</span>
          </div>

          <!-- 카메라 꺼짐(전역 게시 중단): 라이브 보기가 성립하지 않으므로 안내만 -->
          <div v-else-if="stopped && !sseState.streaming_active" class="video-overlay static">
            <i class="ph ph-video-camera-slash empty-icon"></i>
            <span class="overlay-text">{{ t('home.camOff') }}</span>
            <span class="overlay-hint">{{ t('home.camOffHint') }}</span>
          </div>

          <button v-else-if="stopped" class="video-overlay" @click="handleConnect">
            <span class="play-ring"><i class="ph-fill ph-play"></i></span>
            <span class="overlay-text">{{ t('home.tapConnect') }}</span>
          </button>

          <button v-else-if="loading" class="video-overlay" @click="handleDisconnect">
            <span class="spinner"></span>
            <span class="overlay-text">{{ t('home.connCancel') }}</span>
          </button>

          <template v-if="isPlaying">
            <span class="live-badge">LIVE</span>
            <span class="stream-meta">● {{ streamMeta }}</span>
          </template>

          <!-- 축소 화면: 연결 해제 + 전체 화면 -->
          <div v-if="!fullscreen && isPlaying" class="video-actions">
            <button class="video-action" :aria-label="t('live.disconnect')" @click="handleDisconnect">
              <i class="ph ph-plugs"></i>
            </button>
            <button class="video-action" :aria-label="t('live.fullscreen.enter')" @click="enterFullscreen">
              <i class="ph ph-corners-out"></i>
            </button>
          </div>

          <!-- 전체 화면: 연결 해제 · 로그 · 종료 -->
          <div v-if="fullscreen" class="fs-cluster">
            <button
              v-if="isPlaying"
              class="fs-round"
              :aria-label="t('live.disconnect')"
              @click="handleDisconnect"
            ><i class="ph ph-plugs"></i></button>
            <button
              class="fs-round"
              :class="{ on: fsLog }"
              :aria-label="t('dashboard.panel.log')"
              :aria-pressed="fsLog"
              @click="fsLog = !fsLog"
            ><i class="ph ph-list-dashes"></i></button>
            <button
              class="fs-round"
              :aria-label="t('live.fullscreen.exit')"
              @click="exitFullscreen"
            ><i class="ph ph-corners-in"></i></button>
          </div>

          <!-- 전체 화면: 줌 버튼 + PTZ 패드 (시안: 항상 표시, 비활성 시 흐림) -->
          <div v-if="fullscreen" class="fs-br">
            <span v-if="fsPtzError" class="fs-ptz-err">{{ fsPtzError }}</span>
            <div class="fs-br-row">
              <div class="fs-ptz" :class="[padPressing ? `press-${padPressing}` : '', { off: !padActive }]">
                <button
                  v-for="dir in ['up', 'left', 'right', 'down']"
                  :key="dir"
                  class="fs-ptz-btn"
                  :class="[dir, { off: !padActive }]"
                  @pointerdown.prevent="onPadPress(dir)"
                  @pointerup="padUp"
                  @pointercancel="padUp"
                  @pointerleave="padUp"
                ><i :class="`ph ph-caret-${dir}`"></i></button>
                <span class="fs-knob" aria-hidden="true"></span>
                <button
                  class="fs-ptz-btn center"
                  :class="{ off: !padActive, flash: padStopFlash }"
                  :aria-label="t('live.ptz.stop')"
                  @click="onPadStopPress"
                >STOP</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 전체 화면: 접이식 추론 로그 패널 -->
        <aside v-if="fullscreen && fsLog" class="fs-log">
          <div class="fs-log-head">
            <span class="fs-vlm">
              <span class="fs-vlm-dot" :style="{ background: vlmDot }"></span>{{ vlmLabel }}
            </span>
            <button class="fs-log-x" @click="fsLog = false"><i class="ph ph-x"></i></button>
          </div>
          <div class="fs-log-list">
            <div v-if="!logEntries.length" class="log-none">{{ t('home.noLogs') }}</div>
            <template v-for="(entry, i) in logEntries" :key="entry.id">
              <div v-if="entry.header" class="log-day">
                <span class="log-day-rule"></span>
                <span>{{ entry.header }}</span>
                <span class="log-day-rule"></span>
              </div>
              <div class="log-entry" :class="{ latest: i === 0 }">
                <span class="log-time">{{ entry.time }}</span>
                <span>{{ entry.text }}</span>
              </div>
            </template>
          </div>
        </aside>
      </div>
    </div>

    <!-- ── 기기 제어 (조명 · 온도 · 마이크 · PTZ) ── -->
    <div class="dev-row">
      <button
        v-for="d in deviceButtons"
        :key="d.key"
        class="dev-btn"
        @click="emit('open-sheet', d.key)"
      >
        <i :class="d.icon"></i>
        <span>{{ d.label() }}</span>
      </button>
      <!-- 낙관적 활성 정책: PTZ 포트 미입력(=미지원)만 사전 비활성 -->
      <button class="dev-btn" :disabled="!ptzEnabled" @click="emit('open-sheet', 'ptz')">
        <i class="ph ph-crosshair"></i>
        <span>PTZ</span>
      </button>
    </div>

    <!-- ── VLM 카드 — 전체가 아코디언 (사용자 확정) ── -->
    <div class="vlm-card">
      <!-- 접힘: 상태 + 최신 로그 한 줄 -->
      <button v-if="!vlmOpen" class="vlm-head as-toggle" :aria-expanded="false" @click="vlmOpen = true">
        <span class="vlm-status">
          <span class="vlm-dot" :style="{ background: vlmDot }"></span>{{ vlmLabel }}
        </span>
        <span v-if="latestLog" class="log-latest">
          <span class="log-text one-line">{{ latestLog.text }}</span>
        </span>
        <i class="ph ph-caret-down vlm-caret"></i>
      </button>

      <!-- 펼침: 상태 + 모델·시작 + 로그 목록 -->
      <template v-else>
      <div class="vlm-head">
        <span class="vlm-status">
          <span class="vlm-dot" :style="{ background: vlmDot }"></span>{{ vlmLabel }}
        </span>
        <div class="vlm-actions">
          <div class="model-wrap">
            <button
              class="model-btn"
              :class="{ busy: modelSwitching }"
              :aria-busy="modelSwitching"
              :aria-expanded="modelMenu"
              @click="modelMenu = !modelMenu"
              @keydown.esc="modelMenu = false"
            >
              {{ modelLabel }}<i :class="modelMenu ? 'ph ph-caret-up' : 'ph ph-caret-down'"></i>
            </button>
            <div v-if="modelMenu" class="menu-backdrop" @click="modelMenu = false"></div>
            <div v-if="modelMenu" class="model-menu" @keydown.esc="modelMenu = false">
              <button
                v-for="m in sseState.vlm_models"
                :key="m"
                class="model-opt"
                :class="{ current: m === sseState.vlm_current_model }"
                :aria-label="m"
                @click="switchModel(m)"
              ><span>{{ shortModelName(m) }}</span></button>
              <div v-if="!sseState.vlm_models.length" class="model-none">{{ t('dashboard.model.none') }}</div>
            </div>
          </div>
          <!-- 정지는 추론 일관성을 해쳐 제거(사용자 확정) — 전체 정지는 카메라 끄기가 담당 -->
          <button
            v-if="!analysisActive"
            class="infer-btn"
            :class="{ busy: analysisBusy }"
            :disabled="analysisBusy"
            :aria-busy="analysisBusy"
            @click="onInferClick"
          >{{ t('prompt.action.start') }}</button>
          <button class="vlm-fold" :aria-expanded="true" @click="vlmOpen = false">
            <i class="ph ph-caret-up"></i>
          </button>
        </div>
      </div>

      <div v-if="!latestLog" class="log-none">{{ t('dashboard.log.waiting') }}</div>
      <div v-else class="log-entry latest">
        <span class="log-time">{{ latestLog.time }}</span>
        <span class="log-text clamp-3">{{ latestLog.text }}</span>
      </div>
      </template>
    </div>

    <!-- ── 요약 대시보드 (사용자 확정): 프로필 · 오늘 일정 · 오늘 이벤트 ── -->
    <div class="sum-grid">
      <button class="sum-row" @click="emit('open-overlay', 'profile')">
        <span class="sum-avatar">
          <img v-if="profile.photo" :src="profile.photo" alt="">
          <i v-else class="ph ph-dog"></i>
        </span>
        <span class="sum-copy">
          <span class="sum-title">{{ profile.name || t('profile.title') }}</span>
          <span class="sum-value">{{ profileSub }}</span>
        </span>
        <i class="ph ph-caret-right sum-caret"></i>
      </button>
      <button class="sum-row" @click="emit('go-tab', 'cal')">
        <span class="sum-icon"><i class="ph ph-calendar-blank"></i></span>
        <span class="sum-copy">
          <span class="sum-title">{{ t('home.card.schedule') }}</span>
          <span class="sum-value">{{ scheduleSummary }}</span>
        </span>
        <i class="ph ph-caret-right sum-caret"></i>
      </button>
      <button class="sum-row" @click="emit('go-tab', 'ana')">
        <span class="sum-icon"><i class="ph ph-chart-bar"></i></span>
        <span class="sum-copy">
          <span class="sum-title">{{ t('home.card.events') }}</span>
          <span class="sum-value">{{ eventSummary }}</span>
        </span>
        <i class="ph ph-caret-right sum-caret"></i>
      </button>
    </div>

  </div>
</template>

<style scoped>
.home-tab {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* — video: 기본 16:9 영역. 스트림이 16:9가 아니면 contain이 레터박스를 만든다.
   (시안의 고정 252px은 실스트림 비율과 어긋나 상하 여백이 생겨 16:9로 확정) — */
.video-wrap {
  position: relative;
  flex: none;
  aspect-ratio: 16 / 9;
  background: var(--clip-bg);
  overflow: hidden;
}
.rotor {
  position: absolute;
  inset: 0;
  display: flex;
}
.videobox {
  position: relative;
  flex: 1;
  min-width: 0;
}
.videobox video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
/* 전체 화면: 세로 기기에서 가로 캔버스로 회전 (시안 방식) */
.video-wrap.fs {
  position: fixed;
  inset: 0;
  z-index: 150;
  height: auto;
  aspect-ratio: auto;
  background: #0b0c12;
}
/* 세로 화면: 가로 캔버스를 90° 회전해 채운다.
   inset은 top·left의 축약형이므로 반드시 top/left보다 먼저 두어야 한다. */
.video-wrap.fs .rotor {
  inset: auto;
  top: 50%;
  left: 50%;
  width: 100vh;
  height: 100vw;
  transform: translate(-50%, -50%) rotate(90deg);
}
/* 이미 가로 화면이면 회전 없이 그대로 채운다.
   inset: 0이 네 변을 모두 지정하므로 top/left를 다시 선언하지 않는다. */
@media (orientation: landscape) {
  .video-wrap.fs .rotor {
    inset: 0;
    width: auto;
    height: auto;
    transform: none;
  }
}

.video-overlay {
  position: absolute;
  inset: 0;
  border: none;
  background: none;
  cursor: pointer;
  font-family: inherit;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.video-overlay.static { cursor: default; }
.empty-icon {
  font-size: 30px;
  color: var(--color-neutral-600);
}
.overlay-text {
  font-size: var(--font-body);
  color: var(--clip-text);
}
.overlay-hint {
  font-size: var(--font-label);
  color: var(--clip-meta);
}
.play-ring {
  width: 56px; height: 56px;
  border-radius: 28px;
  background: var(--play-icon-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}
.play-ring i {
  font-size: 22px;
  color: var(--play-icon-arrow);
}
.spinner {
  width: 30px; height: 30px;
  border-radius: 15px;
  border: 3px solid var(--color-neutral-700);
  border-top-color: var(--color-accent);
  animation: sp 0.8s linear infinite;
}
@keyframes sp { to { transform: rotate(360deg); } }

.live-badge {
  position: absolute;
  top: 12px; left: 14px;
  height: 24px;
  padding: 0 9px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--color-accent) 30%, transparent);
  color: var(--color-accent);
  font-size: var(--font-caption);
  font-weight: 800;
  display: flex;
  align-items: center;
}
.stream-meta {
  position: absolute;
  bottom: 11px; left: 14px;
  font-size: var(--font-caption);
  color: #e9e9ed;
  background: rgba(0, 0, 0, 0.45);
  padding: 4px 8px;
  border-radius: 5px;
}
/* 시안: 전체화면에서는 반투명 알약 배경 + fs-round와 동일한 테두리 */
.video-wrap.fs .stream-meta {
  border: 1px solid rgba(255, 255, 255, 0.2);
  bottom: 14px; left: 18px;
  font-size: var(--font-caption);
  color: rgba(233, 233, 237, 0.6);
  background: rgba(0, 0, 0, 0.45);
  padding: 5px 9px;
  border-radius: 5px;
}
.video-actions {
  position: absolute;
  top: 8px; right: 10px;
  display: flex;
  gap: 6px;
}
.video-action {
  width: 40px; height: 40px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.4);
  color: #e9e9ed;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* — fullscreen chrome — */
.fs-cluster {
  position: absolute;
  top: 12px; right: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.fs-round {
  width: 40px; height: 40px;
  border-radius: 100px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.45);
  color: #e9e9ed;
  font-size: 17px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.fs-round.on {
  background: color-mix(in srgb, var(--color-accent) 35%, rgba(0, 0, 0, 0.45));
}
.fs-br {
  position: absolute;
  bottom: 14px; right: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.fs-br-row {
  display: flex;
  align-items: flex-end;
  gap: 14px;
}
.fs-ptz-err {
  max-width: 230px;
  font-size: var(--font-label);
  line-height: 1.45;
  color: var(--color-text);
  background: rgba(0, 0, 0, 0.5);
  padding: 6px 9px;
  border-radius: 6px;
}
/* 확대 모드 PTZ — 시트와 동일한 단일 원형 패드(큰 원 + 노브) 구성 (사용자 확정).
   기하: 패드 124, 꺾쇠 버튼 38(인셋 4) → 꺾쇠 중심 ±39px, 노브 44. */
.fs-ptz {
  position: relative;
  width: 124px;
  height: 124px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-sizing: border-box;
}
.fs-ptz-btn {
  z-index: 1;
  position: absolute;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #e9e9ed;
  font-size: 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
}
.fs-ptz-btn.up    { top: 4px; left: 50%; transform: translateX(-50%); }
.fs-ptz-btn.down  { bottom: 4px; left: 50%; transform: translateX(-50%); }
.fs-ptz-btn.left  { left: 4px; top: 50%; transform: translateY(-50%); }
.fs-ptz-btn.right { right: 4px; top: 50%; transform: translateY(-50%); }
/* 노브 원판 — 꺾쇠 아래 층에서 해당 꺾쇠 중심(±39px)까지 밀린다 */
.fs-knob {
  z-index: 0;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 44px;
  height: 44px;
  border-radius: 50%;
  /* PTZ 시트의 노브와 동일한 색 (사용자 확정) */
  border: 1px solid var(--color-accent-700);
  background: var(--color-accent-900);
  transition: transform 0.15s ease;
  pointer-events: none;
}
.fs-ptz.press-up    .fs-knob { transform: translate(-50%, calc(-50% - 39px)); }
.fs-ptz.press-down  .fs-knob { transform: translate(-50%, calc(-50% + 39px)); }
.fs-ptz.press-left  .fs-knob { transform: translate(calc(-50% - 39px), -50%); }
.fs-ptz.press-right .fs-knob { transform: translate(calc(-50% + 39px), -50%); }
/* STOP 라벨·히트 영역은 중앙 고정 (원판 비주얼은 fs-knob가 담당) */
.fs-ptz-btn.center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 44px;
  height: 44px;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  font-family: inherit;
}
.fs-ptz-btn.center.flash {
  opacity: 0.5;
  transform: translate(-50%, -50%) scale(0.92);
}
/* 시안: 비활성 시 흐림 */
.fs-ptz.off { background: rgba(0, 0, 0, 0.28); }
.fs-ptz.off .fs-ptz-btn { color: rgba(233, 233, 237, 0.3); cursor: default; }
.fs-ptz.off .fs-knob { opacity: 0.45; }
.fs-log {
  /* 회전 캔버스 폭에 비례(시안 812px 기준 280px ≈ 34%) — 작은 화면에서
     영상 폭을 과점하지 않도록 절대폭 대신 비율과 상하한을 쓴다 */
  width: 34%;
  min-width: 200px;
  max-width: 320px;
  flex: none;
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
}
.fs-log-head {
  flex: none;
  height: 50px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px 0 15px;
  border-bottom: 1px solid var(--color-divider);
}
.fs-vlm {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: var(--font-label);
  color: var(--color-text);
}
.fs-vlm-dot {
  width: 6px; height: 6px;
  border-radius: 4px;
}
.fs-log-x {
  width: 40px; height: 40px;
  border: none;
  border-radius: 100px;
  background: none;
  color: var(--color-neutral-300);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.fs-log-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 12px 15px;
}
/* 로그 목록 공용 (VLM 카드·전체화면 패널) — babycat 사양 */
.log-day {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  font-size: var(--font-label);
  color: var(--color-neutral-400);
}
.log-day-rule {
  flex: 1;
  height: 1px;
  background: var(--color-divider);
}
.log-entry {
  flex: none;
  display: flex;
  gap: 8px;
  font-size: var(--font-label);
  line-height: 1.5;
  color: var(--color-neutral-400);
  border-radius: 6px;
}
.log-entry.latest,
.log-entry.latest .log-text { color: var(--color-text); }
.log-time {
  flex: none;
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
}
.log-none {
  padding: 10px 2px;
  font-size: var(--font-body);
  color: var(--color-neutral-400);
}

/* — 기기 제어 버튼 — */
.dev-row {
  flex: none;
  margin: 12px 16px 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.dev-btn {
  height: 52px;
  border-radius: 12px;
  border: none;
  background: var(--color-neutral-900);
  color: var(--color-neutral-300);
  font-family: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
}
.dev-btn i { font-size: 17px; }
.dev-btn span { font-size: var(--font-caption); }
.dev-btn:active { background: var(--color-neutral-800); }
.dev-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

/* — VLM 로그 카드 (babycat/client/android LiveMobile과 동일 사양) — */
.vlm-card {
  flex: none; /* 내용 높이만 차지 (사용자 확정) */
  border-radius: 16px;
  padding: 14px;
  margin: 12px 16px;
  background: var(--color-neutral-900);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.vlm-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.vlm-status {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: var(--font-label); /* 상태 텍스트 축소 (사용자 확정) */
  min-width: 0;
}
.vlm-dot {
  width: 6px; height: 6px;
  flex: none;
  border-radius: 50%;
}
.vlm-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.model-wrap { position: relative; }
.model-btn {
  height: 30px;
  padding: 0 8px 0 10px;
  border-radius: 100px;
  border: none;
  background: var(--color-neutral-800);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--font-label);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  max-width: 130px;
  white-space: nowrap;
  overflow: hidden;
}
.model-btn i { font-size: 11px; color: var(--color-neutral-400); }
.menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 19;
}
.model-menu {
  position: absolute;
  top: 36px;
  right: 0;
  z-index: 20;
  /* 내용 폭을 따르되 상·하한을 둔다(긴 모델명은 항목의 말줄임이 처리) */
  width: max-content;
  min-width: 160px;
  max-width: 260px;
  background: var(--color-surface);
  border-radius: 12px;
  padding: 4px;
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.model-opt {
  height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--font-body);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
}
.model-opt span {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-opt.current { background: color-mix(in srgb, var(--color-accent) 16%, transparent); }
.model-none {
  padding: 8px 10px;
  font-size: var(--font-body);
  color: var(--color-neutral-500);
}
.infer-btn {
  height: 30px;
  flex: none;
  padding: 0 11px;
  border-radius: 100px;
  border: none;
  background: var(--color-neutral-800);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--font-label);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}
.infer-btn.on { background: color-mix(in srgb, var(--color-accent) 28%, transparent); }
.infer-btn:disabled { opacity: 0.6; cursor: default; }

.log-rule {
  flex: none;
  height: 1px;
  background: var(--color-divider);
}
.vlm-head.as-toggle {
  width: 100%;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  gap: 10px;
}
.vlm-caret {
  flex: none;
  font-size: 13px;
  color: var(--color-neutral-500);
}
.vlm-fold {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 100px;
  background: none;
  color: var(--color-neutral-500);
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.log-latest {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 8px;
  font-size: var(--font-label);
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
}
.log-text.clamp-3 {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}
.log-text.one-line {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.log-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 8px;
}

/* ── 요약 대시보드 ── */
.sum-grid {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 16px 12px;
}
.sum-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: none;
  border-radius: 16px;
  background: var(--color-neutral-900);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}
.sum-avatar {
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 19px;
  background: var(--color-neutral-800);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-neutral-500);
  font-size: 18px;
}
.sum-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.sum-icon {
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 19px;
  background: var(--color-neutral-800);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-neutral-400);
  font-size: 17px;
}
.sum-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sum-title {
  font-size: var(--font-label);
  color: var(--color-neutral-400);
}
.sum-value {
  font-size: var(--font-body);
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sum-caret {
  flex: none;
  font-size: 13px;
  color: var(--color-neutral-500);
}
</style>
