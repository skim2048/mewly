<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { useCamera } from '../composables/useCamera.js'
import { useLocale } from '../composables/useLocale.js'
import { useSSE } from '../composables/useSSE.js'
import { authFetch, failureDetail } from '../composables/useFetch.js'
import { APP_ENDPOINTS } from '../endpoints.js'
import { useToast } from '../composables/useToast.js'
import { useAnalysis } from '../composables/useAnalysis.js'
import network from '../../config/network.json'

const emit = defineEmits(['close'])
const { config, status, save } = useCamera()
const { t } = useLocale()
const { state } = useSSE()
const { showToast } = useToast()
const { start: startAnalysis } = useAnalysis()

// @claude Local working copy — cancelling leaves the shared config untouched.
const local = reactive({
  source_type: 'rtsp_camera',
  ip: '',
  rtsp_port: 554,
  username: '',
  password: '',
  password_set: false,
  stream_path: 'stream1',
  onvif_port: null,
})

const passwordLoaded = ref(false)
// 저장 후 안내 박스 — 저장이 곧 적용이므로(자동 연계) 단일 문구만 쓴다
const saveBusy = ref(false)

// ── 일회성 통지 — 한 번에 하나만(새 통지가 대체). 정보는 4초 자동 소멸,
// ── 오류는 다음 동작까지 유지. 저장·로드 오류(useCamera.status)가 우선한다.
const notice = ref(null) // null | { kind: 'info' | 'error', text }
let noticeTimer = null
function setNotice(kind, text) {
  clearTimeout(noticeTimer)
  notice.value = { kind, text }
  if (kind === 'info') noticeTimer = setTimeout(() => { notice.value = null }, 4000)
}

onMounted(() => {
  Object.assign(local, {
    source_type: config.source_type,
    ip: config.ip,
    rtsp_port: config.rtsp_port,
    username: config.username,
    password: '',
    password_set: config.password_set,
    stream_path: config.stream_path,
    onvif_port: config.onvif_port,
  })
  if (config.password_set) {
    passwordLoaded.value = true
  }
})

function onPasswordFocus() {
  if (passwordLoaded.value) {
    local.password = ''
    passwordLoaded.value = false
  }
}

// @claude 절차 재확정(사용자): 카메라를 끈 상태에서만 저장한다 — 저장 버튼은
// @claude 켜짐 동안 비활성이며, 완료 토스트가 「다시 켜세요」로 다음 단계를
// @claude 안내한다. 자동 적용(끄고 켜기)은 폐기되었다.
async function handleSave() {
  if (saveBusy.value || state.streaming_active) return
  saveBusy.value = true
  notice.value = null
  try {
    Object.assign(config, local)
    await save()
    if (status.value) return
    showToast('camSaved')
    await turnOn() // 사용자 확정: 저장이 곧 켜기로 이어진다
  } finally {
    saveBusy.value = false
  }
}

// @claude FR-048/FR-049: registration never connects the source; the client
// @claude composes explicit start/stop calls (auto-apply above, toggle below).
const streamingBusy = ref(false)

// 순수 요청 — busy 관리는 호출자 몫. 실패는 오류 통지로 남긴다.
async function requestStreaming(url) {
  try {
    const res = await authFetch(url, { method: 'POST' })
    if (res.ok) return true
    const detail = await failureDetail(res, '')
    setNotice('error', t('camera.streaming.failed') + (detail ? `: ${detail}` : ''))
  } catch {
    setNotice('error', t('camera.streaming.failed'))
  }
  return false
}

// SSE의 streaming_active가 목표값이 될 때까지 대기 (응답 유실 대비 상한)
function waitForStreaming(target, timeoutMs = network.cameraToggleWaitMs) {
  return new Promise((resolve) => {
    if (state.streaming_active === target) return resolve(true)
    const stop = watch(() => state.streaming_active, (v) => {
      if (v === target) {
        stop()
        clearTimeout(timer)
        resolve(true)
      }
    })
    const timer = setTimeout(() => {
      stop()
      resolve(false)
    }, timeoutMs)
  })
}

// @claude 켜기/끄기의 완료 판정은 요청 성공이 아니라 SSE 상태 전환이다 —
// @claude 안내 문구가 버튼 라벨(상태 기반)보다 앞서 나오면 안 된다(사용자 지적).
// @claude 전환이 반영될 때까지 busy를 유지하여 라벨·안내가 같은 순간에 바뀐다.
// 켜기 완료 공정 — 요청 → SSE 전환 대기 → 완료 토스트 + VLM 추론 자동 시작
async function turnOn() {
  if (!(await requestStreaming(APP_ENDPOINTS.streamingStart))) return false
  if (!(await waitForStreaming(true))) {
    setNotice('error', t('camera.streaming.failed'))
    return false
  }
  showToast('camOn')
  startAnalysis() // 결과는 홈 VLM 카드가 표시
  return true
}

async function toggleStreaming() {
  if (streamingBusy.value) return
  notice.value = null
  streamingBusy.value = true
  try {
    if (state.streaming_active) {
      if (!(await requestStreaming(APP_ENDPOINTS.streamingStop))) return
      if (await waitForStreaming(false)) showToast('camOff')
      else setNotice('error', t('camera.streaming.failed'))
    } else {
      await turnOn()
    }
  } finally {
    streamingBusy.value = false
  }
}
</script>

<template>
  <div class="form-col">
    <!-- 통지 슬롯은 오류 전용 — 성공·상태 안내는 토스트가 담당 (사용자 확정) -->
    <div v-if="status" class="notice-box error"><span>{{ status }}</span></div>
    <div v-else-if="notice" class="notice-box" :class="notice.kind"><span>{{ notice.text }}</span></div>

    <label class="form-field">{{ t('camera.field.username') }}
      <input v-model="local.username" placeholder="admin" />
    </label>
    <label class="form-field">{{ t('camera.field.password') }}
      <input
        v-model="local.password"
        :class="{ 'pw-loaded': passwordLoaded }"
        type="password"
        :placeholder="passwordLoaded ? t('camera.field.passwordPlaceholder') : ''"
        @focus="onPasswordFocus"
      />
    </label>
    <label class="form-field">{{ t('camera.field.host') }}
      <input v-model="local.ip" inputmode="decimal" placeholder="192.168.1.101" />
    </label>
    <div class="form-row">
      <label class="form-field">{{ t('camera.field.rtspPort') }}
        <input v-model.number="local.rtsp_port" type="number" inputmode="numeric" enterkeyhint="next" />
      </label>
      <label class="form-field">{{ t('camera.field.onvifPort') }}
        <input v-model.number="local.onvif_port" type="number" inputmode="numeric" enterkeyhint="next" placeholder="2020" />
      </label>
    </div>
    <label class="form-field">{{ t('camera.field.streamPath') }}
      <input v-model="local.stream_path" placeholder="stream1" />
    </label>

    <div class="form-actions">
      <button
        class="form-btn primary"
        :class="{ busy: saveBusy }"
        :disabled="saveBusy || state.streaming_active"
        :aria-busy="saveBusy"
        @click="handleSave"
      >{{ t('camera.action.save') }}</button>
      <button
        class="form-btn"
        :class="{ busy: streamingBusy }"
        :disabled="streamingBusy || saveBusy"
        :aria-busy="streamingBusy"
        @click="toggleStreaming"
      >
        {{ state.streaming_active ? t('camera.streaming.stop') : t('camera.streaming.start') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.notice-box {
  display: flex;
  gap: 9px;
  padding: 11px 12px;
  border-radius: 8px;
  background: var(--color-neutral-900);
  border-left: 2px solid var(--color-accent);
  align-items: flex-start;
  font-size: var(--font-body);
  line-height: 1.55;
  color: var(--color-neutral-300);
}
.notice-box.error { border-left-color: var(--color-danger); }
input.pw-loaded { color: var(--color-neutral-500); }
input[type='number']::-webkit-inner-spin-button,
input[type='number']::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type='number'] { -moz-appearance: textfield; }
</style>
