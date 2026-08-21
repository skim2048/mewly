<script setup>
import { computed, ref, watch } from 'vue'
import ModalFrame from './ModalFrame.vue'
import { useSSE } from '../composables/useSSE.js'
import { authFetch } from '../composables/useFetch.js'
import { APP_ENDPOINTS } from '../endpoints.js'
import { useLocale } from '../composables/useLocale.js'
import { toIsoDate } from '../composables/dates.js'
import {
  LABEL_GROUPS,
  DEFAULT_DAY_START,
  DEFAULT_DAY_END,
  buildPresetsPayload,
  markPresetApplied,
} from '../composables/analysisConfig.js'

// @claude 2층 어휘·프리셋 주입 패널. 어휘와 프롬프트는 검증된 상수
// @claude (analysisConfig.js)이고, 사용자가 조정하는 값은 주간 구간뿐이다
// @claude (사용자 확정: 경계 시각은 휴리스틱 탐색 대상). 경계는 정각으로
// @claude 제한한다(회신서 §7.5 — 1시간 버킷과 정렬). 저장은 어휘+프리셋
// @claude 전체 페이로드를 /presets로 보낸다 — 부분 적용 없음(백엔드 규약).
const emit = defineEmits(['close'])

const { state } = useSSE()
const { t } = useLocale()

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const hourText = (h) => `${String(h).padStart(2, '0')}:00`

const dayStartHour = ref(Number(DEFAULT_DAY_START.slice(0, 2)))
const dayEndHour = ref(Number(DEFAULT_DAY_END.slice(0, 2)))
let loaded = false

// SSE 스냅샷의 현재 적용값으로 1회 프리필한다 (PromptSheet와 같은 어법)
watch(
  () => state.presets,
  (presets) => {
    if (loaded || !presets?.length) return
    const day = presets.find((p) => p.id === 'day')
    if (day) {
      dayStartHour.value = Number(day.start.slice(0, 2))
      dayEndHour.value = Number(day.end.slice(0, 2))
      loaded = true
    }
  },
  { immediate: true },
)

const applied = ref(false)
const errorNote = ref('')
watch([dayStartHour, dayEndHour], () => {
  applied.value = false
  errorNote.value = ''
})

const invalid = computed(() => dayStartHour.value === dayEndHour.value)

async function apply() {
  if (invalid.value) {
    errorNote.value = t('ana.panel.invalid')
    return
  }
  errorNote.value = ''
  const payload = buildPresetsPayload(hourText(dayStartHour.value), hourText(dayEndHour.value))
  try {
    const res = await authFetch(APP_ENDPOINTS.presets, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (data.ok) {
      applied.value = true
      // 구성이 바뀐 적용이면 기준선 단절 시점을 기록한다 (회신서 §7.5)
      markPresetApplied(payload, toIsoDate())
    } else {
      errorNote.value = `${t('ana.panel.error')}: ${data.error || ''}`
    }
  } catch {
    errorNote.value = t('ana.panel.error')
  }
}
</script>

<template>
  <ModalFrame :title="t('set.rowAnalysis')" @close="emit('close')">
    <div class="form-col">

      <label class="form-field">{{ t('ana.panel.dayRange') }}
        <span class="time-row">
          <select v-model.number="dayStartHour" class="hour-select">
            <option v-for="h in HOURS" :key="h" :value="h">{{ hourText(h) }}</option>
          </select>
          <span class="time-dash">–</span>
          <select v-model.number="dayEndHour" class="hour-select">
            <option v-for="h in HOURS" :key="h" :value="h">{{ hourText(h) }}</option>
          </select>
        </span>
      </label>
      <p class="panel-note">{{ t('ana.panel.dayNote') }}</p>

      <div class="label-block">
        <span class="label-title">{{ t('ana.panel.labels') }}</span>
        <div v-for="(syns, name) in LABEL_GROUPS" :key="name" class="label-row">
          <span class="label-name">{{ t(`ana.state.${name}`) }}</span>
          <span class="label-syns">{{ syns.join(', ') }}</span>
        </div>
      </div>

      <span v-if="applied" class="panel-status ok">{{ t('ana.panel.applied') }}</span>
      <span v-else-if="errorNote" class="panel-status err">{{ errorNote }}</span>

      <div class="form-actions">
        <button class="form-btn" @click="emit('close')">{{ t('common.cancel') }}</button>
        <button class="form-btn primary" :disabled="invalid" @click="apply">{{ t('common.save') }}</button>
      </div>
    </div>
  </ModalFrame>
</template>

<style scoped>
.time-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hour-select {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 12px;
  border: none;
  border-radius: 10px;
  background-color: var(--color-bg);
  color: var(--color-text);
  font-size: 14px;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
}
.time-dash {
  color: var(--color-neutral-500);
}
.panel-note {
  margin: -4px 0 0;
  font-size: 11.8px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}
.label-block {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 11px 13px;
  border-radius: 10px;
  background: var(--color-bg);
}
.label-title {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--color-neutral-500);
}
.label-row {
  display: flex;
  gap: 10px;
  align-items: baseline;
}
.label-name {
  flex: none;
  width: 52px;
  font-size: 12.5px;
  font-weight: 600;
}
.label-syns {
  font-size: 11.8px;
  color: var(--color-neutral-400);
  word-break: break-all;
}
.panel-status {
  font-size: 12px;
}
.panel-status.ok { color: var(--color-accent); }
.panel-status.err { color: var(--color-neutral-300); }
</style>
