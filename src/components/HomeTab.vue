<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
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

const emit = defineEmits(['open-sheet', 'open-modal', 'go-records'])

const { state: sseState } = useSSE()
const { t } = useLocale()

const { accessToken } = useAuth()
const { configured, connecting, connected, ptzEnabled, setConnected, setDisconnected, disconnect } = useCamera()
const { analysisActive, busy: analysisBusy, toggle: toggleAnalysis } = useAnalysis()
const { entries: inferLog } = useInferLog()
const { vlmDot, vlmLabel, vlmKind } = useVlmStatus()
const { startMove, stopMove } = usePtz()

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

// ── VLM card ──
const modelMenu = ref(false)
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
  try {
    await authFetch(APP_ENDPOINTS.vlmSwitch, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: name }),
    })
  } catch {}
}

// @claude 거부되면(스트리밍 꺼짐) 사유 안내가 있는 프롬프트 모달을 연다.
async function onInferClick() {
  const ok = await toggleAnalysis()
  if (!ok) emit('open-modal', 'prompt')
}

// @claude 시안: VLM 카드에 최신 문장 한 줄, 아래에 최근 로그 10건.
// @claude 오류·준비 중·빈 상태는 각각의 안내 문구로 대체한다.
const latestText = computed(() => {
  if (vlmKind.value === 'err') return t('home.latestErr')
  if (vlmKind.value === 'wait') return t('home.latestWait')
  if (!inferLog.length) return t('home.latestNone')
  return inferLog[0].text
})
const latestTone = computed(() => {
  if (vlmKind.value === 'err') return 'err'
  if (vlmKind.value === 'wait' || !inferLog.length) return 'dim'
  return vlmKind.value === 'on' ? 'live' : 'idle'
})
const showLogs = computed(() => vlmKind.value !== 'err' && inferLog.length > 0)
const prevLogs = computed(() => (showLogs.value ? inferLog.slice(1, 11) : []))

// @claude 시안: 날짜가 바뀌는 지점에만 구분선을 넣되 오늘은 생략하고,
// @claude 어제는 문구로, 그보다 이전은 YY-MM-DD로 표기한다. (전체화면 패널)
const fsLogEntries = computed(() =>
  withDayHeaders(inferLog, (entry) => entry.day, (day, { isToday, isYesterday }) => {
    if (isToday) return null
    return isYesterday ? t('dashboard.day.yesterday') : day.slice(2)
  }),
)

// ── 기기 제어 버튼 (조명·온도·마이크는 목업, PTZ는 실동작) ──
const deviceButtons = [
  { key: 'light', icon: 'ph ph-lightbulb', label: () => t('dev.light') },
  { key: 'temp', icon: 'ph ph-thermometer-simple', label: () => t('dev.temp') },
  { key: 'mic', icon: 'ph ph-microphone', label: () => t('dev.mic') },
]

// ── 전체화면 PTZ 패드 (누르는 동안 이동, 떼면 정지) ──
const PTZ_DIRS = {
  up: { pan: 0, tilt: 1 },
  down: { pan: 0, tilt: -1 },
  left: { pan: -1, tilt: 0 },
  right: { pan: 1, tilt: 0 },
}
const padPressing = ref(null)
function padDown(dir) {
  padPressing.value = dir
  const d = PTZ_DIRS[dir]
  startMove(d.pan, d.tilt)
}
function padUp() {
  if (padPressing.value == null) return
  padPressing.value = null
  stopMove()
}
// @claude 패드가 눌린 채 v-if 조건 변화(회전·스트림 단절)나 컴포넌트 파괴로
// @claude 사라지면 pointerup이 오지 않으므로, 표시 조건이 꺼지는 즉시 정지
// @claude 명령을 보내 카메라가 계속 회전하는 것을 막는다.
const padVisible = computed(() => fullscreen.value && ptzEnabled.value && isPlaying.value)
watch(padVisible, (visible) => {
  if (!visible) padUp()
})

// ── Stream (client/web LiveStream과 동일한 연결 논리) ──

let hls = null
let Hls = null
let stallTimer = null
let retryTimer = null
let pipelineRecoveryTimer = null
let pc = null
let sessionId = 0
const STALL_TIMEOUT = 8000
const RETRY_BACKOFF = 3000

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

onBeforeUnmount(() => {
  landscapeMq?.removeEventListener('change', onOrientationChange)
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

          <!-- 카메라 미등록: 영상 영역 안 안내 (탭하면 카메라 설정) -->
          <button v-if="!configured" class="video-overlay" @click="emit('open-modal', 'camera')">
            <i class="ph ph-video-camera-slash empty-icon"></i>
            <span class="overlay-text">{{ t('home.noCam') }}</span>
            <span class="overlay-hint">{{ t('home.noCamHint') }}</span>
          </button>

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
            <button class="video-action" :title="t('live.disconnect')" @click="handleDisconnect">
              <i class="ph ph-plugs"></i>
            </button>
            <button class="video-action" :title="t('live.fullscreen.enter')" @click="enterFullscreen">
              <i class="ph ph-corners-out"></i>
            </button>
          </div>

          <!-- 전체 화면: 연결 해제 · 로그 · 종료 -->
          <div v-if="fullscreen" class="fs-cluster">
            <button
              v-if="isPlaying"
              class="fs-round"
              :title="t('live.disconnect')"
              @click="handleDisconnect"
            ><i class="ph ph-plugs"></i></button>
            <button
              class="fs-round"
              :class="{ on: fsLog }"
              :title="t('dashboard.panel.log')"
              :aria-pressed="fsLog"
              @click="fsLog = !fsLog"
            ><i class="ph ph-list-dashes"></i></button>
            <button
              class="fs-round"
              :title="t('live.fullscreen.exit')"
              @click="exitFullscreen"
            ><i class="ph ph-corners-in"></i></button>
          </div>

          <!-- 전체 화면: PTZ 패드 (낙관적 활성 — 포트 미입력·미재생만 숨김) -->
          <div v-if="fullscreen && ptzEnabled && isPlaying" class="fs-ptz">
            <button
              v-for="dir in ['up', 'left', 'right', 'down']"
              :key="dir"
              class="fs-ptz-btn"
              :class="dir"
              @pointerdown.prevent="padDown(dir)"
              @pointerup="padUp"
              @pointercancel="padUp"
              @pointerleave="padUp"
            ><i :class="`ph ph-caret-${dir}`"></i></button>
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
            <div v-if="!fsLogEntries.length" class="log-none">{{ t('home.noLogs') }}</div>
            <template v-for="(entry, i) in fsLogEntries" :key="entry.id">
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

    <!-- ── VLM 상태 카드 ── -->
    <div class="vlm-card">
      <div class="vlm-head">
        <span class="vlm-status">
          <span class="vlm-dot" :style="{ background: vlmDot }"></span>{{ vlmLabel }}
        </span>
        <div class="vlm-actions">
          <div class="model-wrap">
            <button
              class="model-btn"
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
                :title="m"
                @click="switchModel(m)"
              ><span>{{ shortModelName(m) }}</span></button>
              <div v-if="!sseState.vlm_models.length" class="model-none">{{ t('dashboard.model.none') }}</div>
            </div>
          </div>
          <button
            class="infer-btn"
            :class="{ on: analysisActive }"
            :disabled="analysisBusy"
            @click="onInferClick"
          >{{ analysisActive ? t('prompt.action.stop') : t('prompt.action.start') }}</button>
        </div>
      </div>
      <div class="vlm-latest" :class="latestTone">{{ latestText }}</div>
    </div>

    <!-- ── 최근 로그 ── -->
    <div class="prev-logs">
      <div class="prev-head">
        <span>{{ t('home.prevLogs') }}</span>
        <button class="view-all" @click="emit('go-records')">{{ t('home.viewAll') }}</button>
      </div>
      <div class="prev-list">
        <span v-if="!prevLogs.length" class="log-none">{{ t('home.noLogs') }}</span>
        <div v-for="l in prevLogs" :key="l.id" class="prev-entry">
          <span class="log-time">{{ l.time }}</span>
          <span class="prev-text">{{ l.text }}</span>
        </div>
      </div>
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

/* — video (시안: 252px 고정) — */
.video-wrap {
  position: relative;
  flex: none;
  height: 252px;
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
.empty-icon {
  font-size: 30px;
  color: var(--color-neutral-600);
}
.overlay-text {
  font-size: 12.5px;
  color: var(--clip-text);
}
.overlay-hint {
  font-size: 11.5px;
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
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
}
.stream-meta {
  position: absolute;
  bottom: 11px; left: 14px;
  font-size: 11px;
  color: var(--clip-text);
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
.fs-ptz {
  position: absolute;
  bottom: 14px; right: 16px;
  display: grid;
  grid-template-columns: repeat(3, 38px);
  grid-template-rows: repeat(3, 38px);
  gap: 5px;
}
.fs-ptz-btn {
  border-radius: 10px;
  border: none;
  background: rgba(0, 0, 0, 0.45);
  color: #e9e9ed;
  font-size: 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
}
.fs-ptz-btn.up { grid-column: 2; grid-row: 1; }
.fs-ptz-btn.left { grid-column: 1; grid-row: 2; }
.fs-ptz-btn.right { grid-column: 3; grid-row: 2; }
.fs-ptz-btn.down { grid-column: 2; grid-row: 3; }

.fs-log {
  width: 280px;
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
  font-size: 12.3px;
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
.log-day {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--color-neutral-500);
}
.log-day-rule {
  flex: 1;
  height: 1px;
  background: var(--color-divider);
}
.log-entry {
  flex: none;
  display: flex;
  gap: 9px;
  font-size: 12.3px;
  line-height: 1.5;
  color: var(--color-neutral-300);
}
.log-entry.latest { color: var(--color-text); }
.log-time {
  flex: none;
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
}
.log-none {
  font-size: 12.3px;
  color: var(--color-neutral-500);
  padding: 6px 0;
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
.dev-btn span { font-size: 11px; }
.dev-btn:active { background: var(--color-neutral-800); }
.dev-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

/* — VLM 상태 카드 — */
.vlm-card {
  flex: none;
  margin: 12px 16px 0;
  padding: 15px;
  border-radius: 12px;
  background: var(--color-neutral-900);
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.vlm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.vlm-status {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11.8px;
  color: var(--color-neutral-400);
  min-width: 0;
}
.vlm-dot {
  flex: none;
  width: 7px; height: 7px;
  border-radius: 4px;
}
.vlm-latest {
  font-size: 12.8px;
  line-height: 1.5;
}
.vlm-latest.live { color: var(--color-text); }
.vlm-latest.idle { color: var(--color-neutral-400); }
.vlm-latest.dim { color: var(--color-neutral-500); }
.vlm-latest.err { color: #e07a86; }

.vlm-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
.model-wrap { position: relative; }
.model-btn {
  height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--color-neutral-800);
  background: none;
  color: var(--color-neutral-300);
  font-size: 11.8px;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
}
.model-btn i { font-size: 11px; }
.menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
}
.model-menu {
  position: absolute;
  top: 34px; right: 0;
  z-index: 95;
  min-width: 170px;
  background: var(--color-surface);
  border: 1px solid var(--color-neutral-800);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  padding: 4px;
  display: flex;
  flex-direction: column;
}
.model-opt {
  height: 38px;
  padding: 0 10px;
  border: none;
  border-radius: 7px;
  background: none;
  color: var(--color-neutral-300);
  font-size: 12.3px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-opt.current { color: var(--color-accent); }
.model-opt:active { background: var(--color-neutral-900); }
.model-none {
  padding: 10px;
  font-size: 12px;
  color: var(--color-neutral-500);
}
.infer-btn {
  height: 30px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-neutral-800);
  background: none;
  color: var(--color-neutral-300);
  font-size: 11.8px;
  font-family: inherit;
  cursor: pointer;
}
.infer-btn.on {
  border-color: var(--color-accent-700);
  background: var(--color-accent-900);
  color: var(--color-accent);
  font-weight: 700;
}
.infer-btn:disabled { opacity: 0.5; cursor: default; }

/* — 최근 로그 — */
.prev-logs {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  margin: 15px 16px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.prev-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12.8px;
  color: var(--color-neutral-400);
}
.view-all {
  border: none;
  background: none;
  color: var(--color-accent);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  padding: 4px;
}
.prev-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 8px;
}
.prev-entry {
  flex: none;
  display: flex;
  gap: 10px;
  font-size: 12.8px;
  line-height: 1.5;
}
.prev-text { color: var(--color-neutral-300); }
</style>
