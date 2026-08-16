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

const PRESETS = [
  { key: 'sleep', icon: 'ph ph-moon', label: () => t('light.preset.sleep') },
  { key: 'room', icon: 'ph ph-house', label: () => t('light.preset.room') },
  { key: 'max', icon: 'ph ph-sun', label: () => t('light.preset.max') },
]
const presetRows = computed(() => PRESETS.map((p) => {
  const step = light.value.presets[p.key]
  return { ...p, value: step * 20, on: !saveMode.value && light.value.step === step }
}))

function onPreset(key) {
  if (saveMode.value) {
    light.value = {
      ...light.value,
      presets: { ...light.value.presets, [key]: light.value.step },
    }
    saveMode.value = false
  } else {
    light.value = { ...light.value, step: light.value.presets[key] }
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
            :key="p.key"
            class="preset-btn"
            :class="{ on: p.on }"
            @click="onPreset(p.key)"
          >
            <span class="preset-top">
              <i v-if="saveMode" class="ph ph-bookmark-simple save-mark"></i>
              <i :class="p.icon"></i>
              <span :class="{ bold: p.on }">{{ p.label() }}</span>
            </span>
            <span class="preset-sub">{{ p.value }}%</span>
          </button>
        </div>
      </div>

      <div class="night-card">
        <button class="night-head" @click="nightOpen = !nightOpen">
          <i class="ph ph-moon-stars night-icon"></i>
          <span class="night-copy">
            <span class="night-title">{{ t('light.night') }}</span>
            <span class="night-sub">{{ nightEnabled ? t('light.nightOnSub') : t('light.nightOffSub') }}</span>
          </span>
          <span class="night-value" :class="{ on: nightEnabled }">{{ nightValue }}</span>
          <i :class="nightOpen ? 'ph ph-caret-up' : 'ph ph-caret-down'" class="night-caret"></i>
        </button>
        <div v-if="nightOpen" class="night-detail">
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

      <span class="light-note">{{ t('light.note') }}</span>
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
.orb-btn {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  padding: 0;
  font-family: inherit;
  cursor: pointer;
}
.orb {
  width: 72px; height: 72px;
  border-radius: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: box-shadow 0.2s, background 0.2s;
}
.orb i {
  font-size: 32px;
  transition: color 0.2s;
}
.orb-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10.8px;
  color: var(--color-accent-300);
  white-space: nowrap;
}
.orb-hint i { font-size: 12px; }

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
.range-row input[type='range'] {
  width: 100%;
  min-width: 0;
  -webkit-appearance: none;
  appearance: none;
  height: 18px;
  background-color: transparent;
  background-size: 100% 8px;
  background-position: center;
  background-repeat: no-repeat;
  border-radius: 4px;
  cursor: pointer;
}
.range-row input[type='range']::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
  background: transparent;
}
.range-row input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 22px; height: 22px;
  margin-top: -9px;
  border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-accent) 22%, transparent);
}
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

.preset-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.preset-head {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.preset-config {
  display: flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: none;
  padding: 0;
  color: var(--color-accent-300);
  font-size: 11.8px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.preset-config i { font-size: 13px; }
.preset-row {
  display: flex;
  gap: 8px;
}
.preset-btn {
  flex: 1;
  height: 56px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: var(--color-neutral-900);
  color: var(--color-neutral-300);
  font-family: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.preset-btn.on {
  border-color: var(--color-accent-700);
  background: var(--color-accent-900);
  color: var(--color-accent);
}
.preset-top {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
}
.preset-top i { font-size: 15px; }
.preset-top .save-mark {
  font-size: 13px;
  color: var(--color-accent-300);
}
.preset-top .bold { font-weight: 800; }
.preset-sub {
  font-size: 10.5px;
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
}

/* — 나이트 모드 — */
.night-card {
  border-radius: 12px;
  background: var(--color-neutral-900);
  display: flex;
  flex-direction: column;
}
.night-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: none;
  background: none;
  cursor: pointer;
  font-family: inherit;
  color: var(--color-text);
  text-align: left;
}
.night-icon {
  flex: none;
  font-size: 17px;
  color: var(--color-neutral-400);
}
.night-copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.night-title {
  font-size: 13.5px;
  font-weight: 700;
}
.night-sub {
  font-size: 11.3px;
  color: var(--color-neutral-500);
}
.night-value {
  flex: none;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--color-neutral-500);
  white-space: nowrap;
}
.night-value.on { color: var(--color-accent); }
.night-caret {
  flex: none;
  font-size: 13px;
  color: var(--color-neutral-600);
}
.night-detail {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 0 16px 14px;
}
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

.light-note {
  font-size: 11.8px;
  line-height: 1.5;
  color: var(--color-neutral-400);
}
</style>
