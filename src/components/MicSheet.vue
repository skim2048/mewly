<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useLocale } from '../composables/useLocale.js'
import { useDevices } from '../composables/useDevices.js'
import SheetFrame from './SheetFrame.vue'

const emit = defineEmits(['close'])

const { t } = useLocale()
const { mic } = useDevices()

// @claude 말하기는 목업 — 실제 음성 전송은 기기·백엔드 인터페이스 확정 후.
const talking = ref(false)

const BAR_HEIGHTS = [8, 14, 22, 26, 18, 24, 12, 16, 9]
const bars = computed(() => BAR_HEIGHTS.map((h, i) => ({
  height: `${talking.value ? h : 5}px`,
  background: talking.value
    ? `color-mix(in srgb, var(--color-accent) ${55 + h * 1.4}%, var(--color-neutral-800))`
    : 'var(--color-neutral-800)',
  animation: talking.value
    ? `micbar ${(0.62 + (i % 4) * 0.11).toFixed(2)}s ease-in-out ${(i * 0.07).toFixed(2)}s infinite`
    : 'none',
})))

const volume = computed({
  get: () => mic.value.volume,
  set: (v) => { mic.value = { ...mic.value, volume: Number(v) } },
})
const volumeFill = computed(() =>
  `linear-gradient(to right, var(--color-accent) ${volume.value}%, var(--color-neutral-800) ${volume.value}%)`,
)

onBeforeUnmount(() => { talking.value = false })
</script>

<template>
  <SheetFrame :title="t('mic.title')" @close="emit('close')">
    <div class="mic-body">
      <div class="mic-stage">
        <button
          class="mic-btn"
          :class="{ on: talking }"
          @click="talking = !talking"
        >
          <i :class="talking ? 'ph-fill ph-microphone' : 'ph ph-microphone'"></i>
        </button>
        <div class="mic-bars">
          <span
            v-for="(b, i) in bars"
            :key="i"
            class="mic-bar"
            :style="b"
          ></span>
        </div>
        <span class="mic-chip" :class="{ on: talking }">
          <span class="mic-chip-dot"></span>{{ talking ? t('mic.talking') : t('mic.idle') }}
        </span>
      </div>

      <div class="vol-block">
        <div class="vol-head">
          <span class="vol-label">{{ t('mic.volume') }}</span>
          <span class="vol-value">{{ volume }}%</span>
        </div>
        <div class="vol-row">
          <i class="ph ph-speaker-low"></i>
          <input
            v-model="volume"
            type="range"
            min="0"
            max="100"
            step="5"
            :style="{ backgroundImage: volumeFill }"
          >
          <i class="ph ph-speaker-high"></i>
        </div>
      </div>

      <span class="mic-note">{{ talking ? t('mic.noteTalking') : t('mic.noteIdle') }}</span>
    </div>
  </SheetFrame>
</template>

<style scoped>
.mic-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.mic-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 30px;
  padding: 24px 16px 20px;
}
.mic-btn {
  width: 124px; height: 124px;
  border-radius: 62px;
  border: 1px solid var(--color-neutral-800);
  background: var(--color-neutral-900);
  color: var(--color-neutral-300);
  font-size: 44px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: box-shadow 0.25s, background 0.25s;
}
.mic-btn.on {
  background: color-mix(in srgb, var(--color-accent) 22%, var(--color-neutral-900));
  box-shadow:
    0 0 0 10px color-mix(in srgb, var(--color-accent) 12%, transparent),
    0 0 28px color-mix(in srgb, var(--color-accent) 30%, transparent);
  color: var(--color-accent);
}
.mic-bars {
  display: flex;
  align-items: flex-end;
  gap: 5px;
  height: 24px;
}
.mic-bar {
  width: 5px;
  border-radius: 3px;
  transform-origin: bottom;
  transition: height 0.2s, background 0.2s;
}
@keyframes micbar {
  0%, 100% { transform: scaleY(0.3); }
  50% { transform: scaleY(1); }
}
.mic-chip {
  margin-top: -18px;
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
.mic-chip.on {
  background: var(--color-accent-900);
  color: var(--color-accent);
}
.mic-chip-dot {
  width: 6px; height: 6px;
  border-radius: 4px;
  background: currentColor;
}

.vol-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.vol-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.vol-label {
  font-size: 12.3px;
  color: var(--color-neutral-400);
}
.vol-value {
  font-size: 11.5px;
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
}
.vol-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.vol-row > i {
  flex: none;
  font-size: 17px;
  color: var(--color-neutral-500);
}
.vol-row input[type='range'] {
  flex: 1;
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
.vol-row input[type='range']::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
  background: transparent;
}
.vol-row input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 22px; height: 22px;
  margin-top: -9px;
  border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-accent) 22%, transparent);
}

.mic-note {
  font-size: 11.8px;
  line-height: 1.5;
  color: var(--color-neutral-400);
}
</style>
