<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useLocale } from '../composables/useLocale.js'
import { useDevices } from '../composables/useDevices.js'
import SheetFrame from './SheetFrame.vue'
import { tapLight } from '../native/init.js'

const emit = defineEmits(['close'])

const { t } = useLocale()
const { mic } = useDevices()

// @claude 말하기는 목업 — 실제 음성 전송은 기기·백엔드 인터페이스 확정 후.
const talking = ref(false)

function startTalk() {
  tapLight()
  talking.value = true
}

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
  <SheetFrame :title="t('dev.mic')" @close="emit('close')">
    <div class="mic-body">
      <div class="mic-stage">
        <button
          class="mic-btn"
          :class="{ on: talking }"
          @pointerdown.prevent="startTalk"
          @pointerup="talking = false"
          @pointercancel="talking = false"
          @pointerleave="talking = false"
          @contextmenu.prevent
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
            class="ctl-range"
            min="0"
            max="100"
            step="5"
            :style="{ backgroundImage: volumeFill }"
          >
          <i class="ph ph-speaker-high"></i>
        </div>
      </div>

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
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
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
  font-size: var(--font-caption);
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
  font-size: var(--font-label);
  color: var(--color-neutral-400);
}
.vol-value {
  font-size: var(--font-label);
  color: var(--color-neutral-400);
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
.vol-row input { flex: 1; min-width: 0; }
</style>
