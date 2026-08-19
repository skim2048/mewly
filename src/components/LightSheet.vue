<script setup>
import { computed, ref } from 'vue'
import { useLocale } from '../composables/useLocale.js'
import { useDevices } from '../composables/useDevices.js'
import SheetFrame from './SheetFrame.vue'

const emit = defineEmits(['close'])

const { t } = useLocale()
const { light } = useDevices()

const saveMode = ref(false)
const nightOpen = ref(false)

const pct = computed(() => light.value.step * 20)
const isOn = computed(() => pct.value > 0)

const rangeValue = computed({
  get: () => pct.value,
  set: (v) => { light.value = { ...light.value, step: Number(v) / 20 } },
})
const rangeFill = computed(() =>
  `linear-gradient(to right, var(--color-accent) ${pct.value}%, var(--color-neutral-800) ${pct.value}%)`,
)

// @claude 끄기 전 밝기를 기억해 두었다가 다시 켤 때 복원한다 (시안 동작).
function togglePower() {
  if (light.value.step > 0) {
    light.value = { ...light.value, lastStep: light.value.step, step: 0 }
  } else {
    light.value = { ...light.value, step: light.value.lastStep || 3 }
  }
}

const glow = computed(() => pct.value / 100)
const orbStyle = computed(() => ({
  background: `color-mix(in srgb, var(--color-accent) ${8 + glow.value * 24}%, var(--color-neutral-800))`,
  boxShadow: isOn.value
    ? `0 0 ${6 + glow.value * 18}px color-mix(in srgb, var(--color-accent) ${18 + glow.value * 34}%, transparent)`
    : 'none',
}))
const orbIconStyle = computed(() => ({
  color: isOn.value
    ? `color-mix(in srgb, var(--color-accent) ${55 + glow.value * 45}%, var(--color-neutral-700))`
    : 'var(--color-neutral-700)',
}))

// 프리셋: PTZ와 동일한 숫자 4슬롯 (사용자 확정)
const PRESET_SLOTS = [1, 2, 3, 4]
const presetRows = computed(() => PRESET_SLOTS.map((slot) => {
  const step = light.value.presets[slot]
  return { slot, value: step * 20, on: !saveMode.value && light.value.step === step }
}))

function onPreset(slot) {
  if (saveMode.value) {
    light.value = {
      ...light.value,
      presets: { ...light.value.presets, [slot]: light.value.step },
    }
    saveMode.value = false
  } else {
    light.value = { ...light.value, step: light.value.presets[slot] }
  }
}

// — 나이트 모드 —
const nightEnabled = computed({
  get: () => light.value.night.enabled,
  set: (v) => { light.value = { ...light.value, night: { ...light.value.night, enabled: v } } },
})
const nightStart = computed({
  get: () => light.value.night.start,
  set: (v) => { light.value = { ...light.value, night: { ...light.value.night, start: v, enabled: true } } },
})
const nightEnd = computed({
  get: () => light.value.night.end,
  set: (v) => { light.value = { ...light.value, night: { ...light.value.night, end: v, enabled: true } } },
})
const nightValue = computed(() =>
  nightEnabled.value ? `${nightStart.value} ~ ${nightEnd.value}` : t('common.off'),
)

const hourOptions = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)
</script>

<template>
  <SheetFrame :title="t('dev.light')" @close="emit('close')">
    <div class="light-body">

      <div class="light-stage">
        <span class="light-copy">
          <span class="light-value-row">
            <span class="light-num" :class="{ off: !isOn }">{{ pct }}</span>
            <span class="light-unit">%</span>
          </span>
          <span class="light-chip" :class="{ on: isOn }">
            <span class="light-chip-dot"></span>{{ isOn ? t('common.on') : t('common.off') }}
          </span>
        </span>
        <button class="orb-btn" @click="togglePower">
          <span class="orb" :style="orbStyle">
            <i class="ph-fill ph-sun" :style="orbIconStyle"></i>
          </span>
          <span class="orb-hint">
            <i class="ph ph-power"></i>{{ isOn ? t('light.turnOff') : t('light.turnOn') }}
          </span>
        </button>
      </div>

      <div class="range-block">
        <div class="range-row">
          <input
            v-model="rangeValue"
            type="range"
            class="ctl-range"
            min="0"
            max="100"
            step="20"
            :style="{ backgroundImage: rangeFill }"
          >
        </div>
        <div class="tick-row">
          <div v-for="n in [0, 20, 40, 60, 80, 100]" :key="n" class="tick-mark" :style="{ left: `${n}%` }">
            <span class="tick"></span>
            <span class="tick-num">{{ n }}</span>
          </div>
        </div>
      </div>

      <div class="preset-block">
        <div class="preset-head">
          <button class="preset-config" @click="saveMode = !saveMode">
            <i v-if="!saveMode" class="ph ph-gear-six"></i>
            {{ saveMode ? t('light.saveMode') : t('light.save') }}
          </button>
        </div>
        <div class="preset-row">
          <button
            v-for="p in presetRows"
            :key="p.slot"
            class="preset-btn"
            :class="{ on: p.on }"
            @click="onPreset(p.slot)"
          >
            <span class="preset-top">
              <i v-if="saveMode" class="ph ph-bookmark-simple save-mark"></i>
              <span class="preset-num" :class="{ bold: p.on }">{{ p.slot }}</span>
            </span>
            <span class="preset-sub">{{ p.value }}%</span>
          </button>
        </div>
      </div>

      <div class="collapse-card">
        <button class="collapse-head" @click="nightOpen = !nightOpen">
          <i class="ph ph-moon-stars collapse-icon"></i>
          <span class="collapse-copy">
            <span class="collapse-title">{{ t('light.night') }}</span>
            <span class="collapse-sub">{{ nightEnabled ? t('light.nightOnSub') : t('light.nightOffSub') }}</span>
          </span>
          <span class="collapse-value" :class="{ on: nightEnabled }">{{ nightValue }}</span>
          <i :class="nightOpen ? 'ph ph-caret-up' : 'ph ph-caret-down'" class="collapse-caret"></i>
        </button>
        <div v-if="nightOpen" class="collapse-detail">
          <div class="night-grid">
            <label class="night-select">{{ t('sched.start') }}
              <select v-model="nightStart">
                <option v-for="o in hourOptions" :key="o" :value="o">{{ o }}</option>
              </select>
            </label>
            <label class="night-select">{{ t('sched.end') }}
              <select v-model="nightEnd">
                <option v-for="o in hourOptions" :key="o" :value="o">{{ o }}</option>
              </select>
            </label>
          </div>
          <button
            class="night-use"
            :class="{ off: nightEnabled }"
            @click="nightEnabled = !nightEnabled"
          >{{ nightEnabled ? t('light.nightStop') : t('light.nightUse') }}</button>
        </div>
      </div>

    </div>
  </SheetFrame>
</template>

<style scoped>
.light-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.light-stage {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 4px 0;
}
.light-copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.light-value-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.light-num {
  font-size: 38px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}
.light-num.off { color: var(--color-neutral-600); }
.light-unit {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-neutral-500);
}
.light-chip {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 9px;
  border-radius: 6px;
  background: var(--color-neutral-800);
  color: var(--color-neutral-400);
  font-size: 11px;
  font-weight: 700;
}
.light-chip.on {
  background: var(--color-accent-900);
  color: var(--color-accent);
}
.light-chip-dot {
  width: 6px; height: 6px;
  border-radius: 4px;
  background: currentColor;
}
/* 조명 오브 아이콘 크기 (공용 .orb는 아이콘 크기를 정하지 않는다) */
.orb i { font-size: 32px; }

.range-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.range-row {
  display: flex;
  align-items: center;
  height: 44px;
}
.range-row input { width: 100%; min-width: 0; }
.tick-row {
  position: relative;
  height: 20px;
  margin: -4px 11px 0;
}
.tick-mark {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.tick {
  width: 1px; height: 5px;
  background: var(--color-neutral-700);
}
.tick-num {
  font-size: 11px;
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
}

/* — 나이트 모드 세부 — */
.night-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.night-select {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 12px;
  border-radius: 10px;
  background: var(--color-neutral-800);
  font-size: 10.8px;
  color: var(--color-neutral-500);
}
.night-select select {
  border: none;
  background: none;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  outline: none;
  cursor: pointer;
}
.night-use {
  align-self: flex-start;
  height: 34px;
  padding: 0 12px;
  border-radius: 100px;
  border: 1px solid var(--color-accent-700);
  background: var(--color-accent-900);
  color: var(--color-accent);
  font-size: 11.8px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.night-use.off {
  border-color: var(--color-neutral-700);
  background: transparent;
  color: var(--color-neutral-300);
}
</style>
