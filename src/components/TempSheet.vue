<script setup>
import { computed, ref } from 'vue'
import { useLocale } from '../composables/useLocale.js'
import { useDevices } from '../composables/useDevices.js'
import SheetFrame from './SheetFrame.vue'

const emit = defineEmits(['close'])

const { t } = useLocale()
const { temp } = useDevices()

const saveMode = ref(false)

const target = computed({
  get: () => temp.value.target,
  set: (v) => { temp.value = { ...temp.value, target: Number(v) } },
})
const mode = computed(() => temp.value.mode)
const pct = computed(() => (target.value - 16) / 14)

// @claude 목업 가동 판정: 목표가 현재 온도와 다르면 운전 중으로 표시한다.
const running = computed(() => target.value !== temp.value.current)
const runLabel = computed(() => {
  if (!running.value) return t('temp.standby')
  return mode.value === 'cool' ? t('temp.runCool') : t('temp.runHeat')
})

function toggleMode() {
  temp.value = { ...temp.value, mode: mode.value === 'cool' ? 'heat' : 'cool' }
}

const rangeFill = computed(() =>
  `linear-gradient(to right, var(--color-accent) ${pct.value * 100}%, var(--color-neutral-800) ${pct.value * 100}%)`,
)
const orbStyle = computed(() => ({
  background: `color-mix(in srgb, var(--color-accent) ${8 + pct.value * 24}%, var(--color-neutral-800))`,
  boxShadow: `0 0 ${6 + pct.value * 18}px color-mix(in srgb, var(--color-accent) ${18 + pct.value * 34}%, transparent)`,
}))
const orbIconStyle = computed(() => ({
  fontSize: mode.value === 'cool' ? '36px' : '32px',
  color: `color-mix(in srgb, var(--color-accent) ${55 + pct.value * 45}%, var(--color-neutral-700))`,
}))

const PRESETS = [
  { key: 'sleep', icon: 'ph ph-moon', label: () => t('temp.preset.sleep') },
  { key: 'active', icon: 'ph ph-paw-print', label: () => t('temp.preset.active') },
  { key: 'eco', icon: 'ph ph-leaf', label: () => t('temp.preset.eco') },
]
const presetRows = computed(() => PRESETS.map((p) => {
  const saved = temp.value.presets[p.key]
  return {
    ...p,
    value: saved.target,
    modeLabel: saved.mode === 'cool' ? t('temp.cool') : t('temp.heat'),
    on: !saveMode.value && target.value === saved.target && mode.value === saved.mode,
  }
}))

function onPreset(key) {
  if (saveMode.value) {
    temp.value = {
      ...temp.value,
      presets: { ...temp.value.presets, [key]: { target: target.value, mode: mode.value } },
    }
    saveMode.value = false
  } else {
    const saved = temp.value.presets[key]
    temp.value = { ...temp.value, target: saved.target, mode: saved.mode }
  }
}

const ticks = Array.from({ length: 15 }, (_, i) => (i / 14) * 100)
</script>

<template>
  <SheetFrame :title="t('dev.temp')" @close="emit('close')">
    <div class="temp-body">

      <div class="temp-stage">
        <span class="temp-copy">
          <span class="temp-cap">{{ t('temp.target') }}</span>
          <span class="temp-value">
            <span class="temp-num">{{ target }}</span>
            <span class="temp-unit">°C</span>
          </span>
          <span class="temp-current">
            <span class="temp-cap">{{ t('temp.current') }}</span>{{ temp.current }}°C
          </span>
          <span class="temp-chip" :class="{ on: running }">{{ runLabel }}</span>
        </span>
        <button class="orb-btn" :title="t('temp.modeSwitch')" @click="toggleMode">
          <span class="orb" :style="orbStyle">
            <i
              :class="mode === 'cool' ? 'ph ph-snowflake' : 'ph-fill ph-fire-simple'"
              :style="orbIconStyle"
            ></i>
          </span>
          <span class="orb-hint">
            <i class="ph ph-arrows-clockwise"></i>{{ t('temp.modeSwitch') }}
          </span>
        </button>
      </div>

      <div class="range-block">
        <div class="range-row">
          <input
            v-model="target"
            type="range"
            class="ctl-range"
            min="16"
            max="30"
            step="1"
            :style="{ backgroundImage: rangeFill }"
          >
        </div>
        <div class="tick-row">
          <span v-for="(x, i) in ticks" :key="i" class="tick" :style="{ left: `${x}%` }"></span>
        </div>
        <div class="range-ends">
          <span><b>{{ t('temp.min') }}</b> 16°C</span>
          <span><b>{{ t('temp.max') }}</b> 30°C</span>
        </div>
      </div>

      <div class="preset-block">
        <div class="preset-head">
          <button class="preset-config" @click="saveMode = !saveMode">
            <i v-if="!saveMode" class="ph ph-gear-six"></i>
            {{ saveMode ? t('temp.saveMode') : t('temp.save') }}
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
            <span class="preset-sub">
              <span>{{ p.modeLabel }}</span>{{ p.value }}°C
            </span>
          </button>
        </div>
      </div>

      <span class="sheet-note">{{ t('temp.note') }}</span>
    </div>
  </SheetFrame>
</template>

<style scoped>
.temp-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.temp-stage {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 4px 0;
}
.temp-copy {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.temp-cap {
  font-size: 11px;
  color: var(--color-neutral-500);
}
.temp-value {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.temp-num {
  font-size: 38px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}
.temp-unit {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-neutral-500);
}
.temp-current {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
}
.temp-chip {
  align-self: flex-start;
  display: flex;
  align-items: center;
  height: 24px;
  padding: 0 9px;
  border-radius: 6px;
  background: var(--color-neutral-800);
  color: var(--color-neutral-400);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.temp-chip.on {
  background: var(--color-accent-900);
  color: var(--color-accent);
}
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
  height: 5px;
  margin: -6px 11px 0;
}
.tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  width: 1px; height: 5px;
  background: var(--color-neutral-700);
}
.range-ends {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
}
.range-ends b {
  color: var(--color-neutral-600);
  font-weight: 700;
  letter-spacing: 0.04em;
}

</style>
