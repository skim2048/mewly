<script setup>
import { computed, ref, watch } from 'vue'
import ModalFrame from './ModalFrame.vue'
import { authFetch } from '../composables/useFetch.js'
import { APP_ENDPOINTS } from '../endpoints.js'
import { useLocale } from '../composables/useLocale.js'
import { toIsoDate } from '../composables/dates.js'
import {
  LABEL_GROUPS,
  dayRange,
  buildLabelsPayload,
  markPresetApplied,
} from '../composables/analysisConfig.js'

// @claude 분석 설정 패널. 프롬프트는 주야간 공통 단일(회신서 §7.4.1)이라
// @claude 저장이 주입하는 것은 어휘뿐이고, 주간 구간은 백엔드가 아니라 야간
// @claude 해석(누움/비누움 2단계)의 로컬 경계다 — 선택 즉시 지속되며(휴리스틱
// @claude 탐색 대상), 정각 제한은 1시간 버킷과의 정렬을 위함이다.
const emit = defineEmits(['close'])

const { t } = useLocale()

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const hourText = (h) => `${String(h).padStart(2, '0')}:00`

const dayStartHour = computed({
  get: () => dayRange.value.start,
  set: (v) => { if (v !== dayRange.value.end) dayRange.value = { ...dayRange.value, start: v } },
})
const dayEndHour = computed({
  get: () => dayRange.value.end,
  set: (v) => { if (v !== dayRange.value.start) dayRange.value = { ...dayRange.value, end: v } },
})

const applied = ref(false)
const errorNote = ref('')
watch(dayRange, () => { errorNote.value = '' }, { deep: true })

async function apply() {
  errorNote.value = ''
  const payload = buildLabelsPayload()
  try {
    const res = await authFetch(APP_ENDPOINTS.presets, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (data.ok) {
      applied.value = true
      // 구성이 바뀐 적용이면 기준선 단절 시점을 기록한다 (회신서 §7.6)
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
        <button class="form-btn primary" @click="apply">{{ t('common.save') }}</button>
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
  font-size: var(--font-body);
  font-family: inherit;
  font-variant-numeric: tabular-nums;
}
.time-dash {
  color: var(--color-neutral-500);
}
.panel-note {
  margin: -4px 0 0;
  font-size: var(--font-label);
  line-height: 1.5;
  color: var(--color-neutral-400);
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
  font-size: var(--font-label);
  font-weight: 700;
  color: var(--color-neutral-400);
}
.label-row {
  display: flex;
  gap: 10px;
  align-items: baseline;
}
.label-name {
  flex: none;
  width: 52px;
  font-size: var(--font-body);
  font-weight: 600;
}
.label-syns {
  font-size: var(--font-label);
  color: var(--color-neutral-400);
  word-break: break-all;
}
.panel-status {
  font-size: var(--font-label);
}
.panel-status.ok { color: var(--color-accent); }
.panel-status.err { color: var(--color-neutral-300); }
</style>
