<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useCamera } from '../composables/useCamera.js'
import { useLocale } from '../composables/useLocale.js'
import { useSSE } from '../composables/useSSE.js'
import { authFetch } from '../composables/useFetch.js'
import { APP_ENDPOINTS } from '../endpoints.js'

const emit = defineEmits(['close'])
const { config, status, save } = useCamera()
const { t } = useLocale()
const { state } = useSSE()

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
const saved = ref(false)

// @claude dirty 판정용 원본 스냅샷 — 변경 없는 저장에 카메라 재시작(영상 순단
// @claude + 분석·녹화 중단)을 걸지 않기 위한 기준값.
const origin = reactive({})

function snapshotOrigin() {
  Object.assign(origin, {
    ip: local.ip,
    rtsp_port: local.rtsp_port,
    username: local.username,
    stream_path: local.stream_path,
    onvif_port: local.onvif_port,
  })
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
  snapshotOrigin()
})

function onPasswordFocus() {
  if (passwordLoaded.value) {
    local.password = ''
    passwordLoaded.value = false
  }
}

async function handleSave() {
  // @claude 저장=적용 자동 연계(사용자 확정): 저장은 카메라가 켜진 상태로
  // @claude 귀결시킨다 — 꺼져 있으면 켜고, 켜진 채 프로필이 바뀌었으면 끄고
  // @claude 다시 켠다. 변경 없는 저장은 재시작하지 않는다(무의미한 순단 방지).
  // @claude 백엔드의 저장·적용 분리 계약(FR-048)은 유지된다 — 명시적 호출의
  // @claude 순차 조합일 뿐 백엔드에 숨은 동작을 요구하지 않는다.
  saved.value = false
  const dirty =
    local.ip !== origin.ip ||
    local.rtsp_port !== origin.rtsp_port ||
    local.username !== origin.username ||
    local.stream_path !== origin.stream_path ||
    local.onvif_port !== origin.onvif_port ||
    (!passwordLoaded.value && local.password !== '')
  Object.assign(config, local)
  await save()
  if (status.value) return
  if (!state.streaming_active) {
    await requestStreaming(APP_ENDPOINTS.streamingStart)
  } else if (dirty) {
    await requestStreaming(APP_ENDPOINTS.streamingStop)
    await requestStreaming(APP_ENDPOINTS.streamingStart)
  }
  if (!streamStatus.value) saved.value = true
  snapshotOrigin()
}

// @claude FR-048/FR-049: registration never connects the source; the client
// @claude composes explicit start/stop calls (auto-apply above, toggle below).
const streamingBusy = ref(false)
const streamStatus = ref('')

async function requestStreaming(url) {
  if (streamingBusy.value) return
  streamingBusy.value = true
  streamStatus.value = ''
  try {
    const res = await authFetch(url, { method: 'POST' })
    const data = await res.json()
    if (!(res.ok && data.ok)) {
      streamStatus.value = t('camera.streaming.failed') + (data.error ? `: ${data.error}` : '')
    }
  } catch {
    streamStatus.value = t('camera.streaming.failed')
  } finally {
    streamingBusy.value = false
  }
}

function toggleStreaming() {
  return requestStreaming(state.streaming_active ? APP_ENDPOINTS.streamingStop : APP_ENDPOINTS.streamingStart)
}
</script>

<template>
  <div class="form-col">
    <div v-if="status" class="notice-box"><i class="ph ph-warning-circle"></i><span>{{ status }}</span></div>
    <div v-if="saved" class="notice-box">
      <i class="ph ph-info"></i>
      <span>{{ t('camera.savedMsg') }}</span>
    </div>
    <div v-if="streamStatus" class="notice-box"><i class="ph ph-warning-circle"></i><span>{{ streamStatus }}</span></div>

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
      <button class="form-btn primary" @click="handleSave">{{ t('camera.action.save') }}</button>
      <button class="form-btn" :disabled="streamingBusy" @click="toggleStreaming">
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
  font-size: 12.3px;
  line-height: 1.55;
  color: var(--color-neutral-300);
}
.notice-box i {
  flex: none;
  font-size: 15.8px;
  color: var(--color-accent);
  margin-top: 1px;
}
input.pw-loaded { color: var(--color-neutral-500); }
input[type='number']::-webkit-inner-spin-button,
input[type='number']::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type='number'] { -moz-appearance: textfield; }
</style>
