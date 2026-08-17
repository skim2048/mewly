<script setup>
import { computed, ref } from 'vue'
import SheetFrame from './SheetFrame.vue'
import { useSSE } from '../composables/useSSE.js'
import { usePtz } from '../composables/usePtz.js'
import { useDevices } from '../composables/useDevices.js'
import { useLocale } from '../composables/useLocale.js'

const props = defineProps({
  active: { type: Boolean, default: false }, // 재생 중 여부 — 낙관적 활성 정책의 사전 비활성 판단
})
const emit = defineEmits(['close'])

const { state } = useSSE()
const { speedLevel, setSpeedLevel, startMove, stopMove, savePreset, gotoPreset } = usePtz()
const { patrol } = useDevices()
const { t, locale } = useLocale()

const ptzPressing = ref(null)
const ptzSaveMode = ref(false)
const ptzMessage = ref('') // '' | 'saveFailed' | 'gotoEmpty'
const patrolOpen = ref(false)

const savedSlots = computed(() => new Set(state.ptz_presets || []))

const ptzDirs = [
  { id: 'up',    pan:  0, tilt:  1 },
  { id: 'down',  pan:  0, tilt: -1 },
  { id: 'left',  pan: -1, tilt:  0 },
  { id: 'right', pan:  1, tilt:  0 },
]

function ptzDown(dir, event) {
  if (!props.active) return
  event.preventDefault()
  ptzPressing.value = dir.id
  startMove(dir.pan, dir.tilt)
}

function ptzUp(dir) {
  if (ptzPressing.value !== dir.id) return
  ptzPressing.value = null
  stopMove()
}

function ptzStopNow() {
  if (!props.active) return
  ptzPressing.value = null
  stopMove()
}

async function onPresetClick(slot) {
  if (!props.active) return
  ptzMessage.value = ''
  if (ptzSaveMode.value) {
    const ok = await savePreset(slot)
    if (!ok) ptzMessage.value = 'saveFailed'
    ptzSaveMode.value = false
  } else {
    const ok = await gotoPreset(slot)
    if (!ok) ptzMessage.value = 'gotoEmpty'
  }
}

const ptzHint = computed(() => {
  if (ptzMessage.value === 'saveFailed') return t('live.ptz.saveFailed')
  if (ptzMessage.value === 'gotoEmpty') return t('live.ptz.gotoEmpty')
  return ptzSaveMode.value ? t('live.ptz.saveHint') : t('live.ptz.gotoHint')
})

// @claude 시안의 속도 2단(보통·고속)은 usePtz의 3단 중 1·2 레벨에 대응한다.
const speedOptions = computed(() => [
  { level: 1, label: t('live.ptz.speedNormal') },
  { level: 2, label: t('live.ptz.speedFast') },
])

// — 자동 순찰 (백엔드 미지원, 형태만) —
const PATROL_INTERVALS = [0, 10, 30, 60, 300, 600]
function intervalLabel(sec) {
  if (sec === 0) return t('ptz.patrolOff')
  if (sec < 60) return locale.value === 'en' ? `${sec}s` : `${sec}초`
  return locale.value === 'en' ? `${sec / 60}m` : `${sec / 60}분`
}
const patrolValue = computed(() =>
  patrol.value.enabled ? intervalLabel(patrol.value.intervalSec) : t('common.off'),
)
function pickInterval(sec) {
  patrol.value = sec === 0
    ? { ...patrol.value, enabled: false }
    : { enabled: true, intervalSec: sec }
}

function onClose() {
  if (ptzPressing.value != null) stopMove()
  emit('close')
}
</script>

<template>
  <SheetFrame title="PTZ" @close="onClose">
    <div class="ptz-sheet" :class="{ off: !active }" :aria-disabled="!active">

      <div class="ptz-top">
        <div class="ptz-pad">
          <button
            v-for="dir in ptzDirs"
            :key="dir.id"
            class="ptz-dir"
            :class="[dir.id, { pressing: ptzPressing === dir.id }]"
            :title="t(`live.ptz.${dir.id}`)"
            @pointerdown="(e) => ptzDown(dir, e)"
            @pointerup="ptzUp(dir)"
            @pointercancel="ptzUp(dir)"
            @pointerleave="ptzUp(dir)"
          ><i :class="`ph ph-caret-${dir.id}`"></i></button>
          <button class="ptz-stop" :title="t('live.ptz.stop')" @click="ptzStopNow">STOP</button>
        </div>

        <div class="ptz-mid">
          <!-- 줌 — 백엔드 미지원으로 비활성 UI만 유지 (인계 문서 「확정 방침」 2) -->
          <div class="ptz-zoom">
            <div class="ptz-row-head">
              <span>{{ t('live.ptz.zoom') }}</span>
              <span class="ptz-zoom-val">×1.0</span>
            </div>
            <div class="ptz-zoom-ctl">
              <i class="ph ph-magnifying-glass-minus"></i>
              <input type="range" min="1" max="8" step="0.5" value="1" disabled />
              <i class="ph ph-magnifying-glass-plus"></i>
            </div>
          </div>
          <div class="ptz-speed">
            <span class="ptz-row-label">{{ t('live.ptz.speed') }}</span>
            <div class="ptz-speed-seg">
              <button
                v-for="(opt, i) in speedOptions"
                :key="opt.level"
                class="ptz-speed-opt"
                :class="{ active: speedLevel === opt.level, first: i === 0 }"
                @click="setSpeedLevel(opt.level)"
              >{{ opt.label }}</button>
            </div>
          </div>
        </div>
      </div>

      <div class="ptz-presets">
        <div class="ptz-presets-head">
          <span class="ptz-row-label">{{ t('live.ptz.presets') }}</span>
          <button class="ptz-save-toggle" @click="ptzSaveMode = !ptzSaveMode; ptzMessage = ''">
            <i v-if="!ptzSaveMode" class="ph ph-gear-six"></i>
            {{ ptzSaveMode ? t('live.ptz.saveCancel') : t('live.ptz.savePosition') }}
          </button>
        </div>
        <div class="ptz-slots">
          <button
            v-for="slot in [1, 2, 3, 4]"
            :key="slot"
            class="ptz-slot"
            :class="{ saved: savedSlots.has(slot) }"
            @click="onPresetClick(slot)"
          >
            <i v-if="ptzSaveMode" class="ph ph-bookmark-simple"></i>{{ slot }}
          </button>
        </div>
        <span class="ptz-hint" :class="{ err: !!ptzMessage }">{{ ptzHint }}</span>
      </div>

      <!-- 자동 순찰 — 백엔드 미지원, 형태만 -->
      <div class="patrol-card">
        <button class="patrol-head" @click="patrolOpen = !patrolOpen">
          <i class="ph ph-path patrol-icon"></i>
          <span class="patrol-copy">
            <span class="patrol-title">{{ t('ptz.patrol') }}</span>
            <span class="patrol-sub">{{ patrol.enabled ? t('ptz.patrolSub') : t('light.nightOffSub') }}</span>
          </span>
          <span class="patrol-value" :class="{ on: patrol.enabled }">{{ patrolValue }}</span>
          <i :class="patrolOpen ? 'ph ph-caret-up' : 'ph ph-caret-down'" class="patrol-caret"></i>
        </button>
        <div v-if="patrolOpen" class="patrol-detail">
          <span class="patrol-label">{{ t('ptz.patrolInterval') }}</span>
          <div class="patrol-grid">
            <button
              v-for="sec in PATROL_INTERVALS"
              :key="sec"
              class="patrol-opt"
              :class="{ on: sec === 0 ? !patrol.enabled : patrol.enabled && patrol.intervalSec === sec }"
              @click="pickInterval(sec)"
            >{{ intervalLabel(sec) }}</button>
          </div>
        </div>
      </div>

    </div>
  </SheetFrame>
</template>

<style scoped>
.ptz-sheet {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.ptz-sheet.off {
  opacity: 0.45;
  pointer-events: none;
  user-select: none;
}
.ptz-top {
  display: flex;
  gap: 16px;
  align-items: center;
  padding-top: 6px;
}
.ptz-pad {
  position: relative;
  width: 176px;
  height: 176px;
  flex: none;
  border-radius: 50%;
  background: var(--color-neutral-900);
  border: 1px solid var(--color-neutral-800);
  box-sizing: border-box;
}
.ptz-dir {
  position: absolute;
  width: 52px; height: 52px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 23px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
}
.ptz-dir.up    { top: 6px; left: 50%; transform: translateX(-50%); }
.ptz-dir.down  { bottom: 6px; left: 50%; transform: translateX(-50%); }
.ptz-dir.left  { left: 6px; top: 50%; transform: translateY(-50%); }
.ptz-dir.right { right: 6px; top: 50%; transform: translateY(-50%); }
.ptz-dir.pressing { color: var(--color-accent); }
.ptz-stop {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 66px; height: 66px;
  border-radius: 50%;
  border: 1px solid var(--color-accent-700);
  background: var(--color-accent-900);
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 700;
  font-family: inherit;
  letter-spacing: 0.04em;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ptz-mid {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ptz-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12.5px;
  color: var(--color-neutral-400);
}
.ptz-zoom { display: flex; flex-direction: column; gap: 7px; }
.ptz-zoom-val {
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
}
.ptz-zoom-ctl {
  display: flex;
  align-items: center;
  gap: 10px;
  opacity: 0.45;
}
.ptz-zoom-ctl > i {
  flex: none;
  font-size: 17px;
  color: var(--color-neutral-500);
}
.ptz-zoom-ctl input[type='range'] {
  flex: 1;
  min-width: 0;
  appearance: none;
  height: 18px;
  background-image: linear-gradient(to right, var(--color-neutral-700), var(--color-neutral-700));
  background-size: 100% 4px;
  background-position: center;
  background-repeat: no-repeat;
  background-color: transparent;
  border-radius: 2px;
}
.ptz-zoom-ctl input[type='range']::-webkit-slider-thumb {
  appearance: none;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: var(--color-neutral-500);
}
.ptz-speed { display: flex; flex-direction: column; gap: 7px; }
.ptz-row-label {
  font-size: 12.5px;
  color: var(--color-neutral-400);
}
.ptz-speed-seg {
  display: flex;
  align-self: flex-start;
  border-radius: 8px;
  overflow: hidden;
}
.ptz-speed-opt {
  width: 78px;
  height: 38px;
  padding: 0;
  border: 1px solid var(--color-neutral-800);
  background: transparent;
  color: var(--color-neutral-400);
  font-size: 12.3px;
  font-family: inherit;
  cursor: pointer;
}
.ptz-speed-opt.first { border-radius: 8px 0 0 8px; }
.ptz-speed-opt:not(.first) { border-radius: 0 8px 8px 0; margin-left: -1px; }
.ptz-speed-opt.active {
  position: relative;
  z-index: 1;
  border-color: var(--color-accent-700);
  background: var(--color-accent-900);
  color: var(--color-accent);
  font-weight: 800;
}

.ptz-presets {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.ptz-presets-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ptz-save-toggle {
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
.ptz-save-toggle i { font-size: 13px; }
.ptz-slots {
  display: flex;
  gap: 8px;
}
.ptz-slot {
  flex: 1;
  height: 56px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: var(--color-neutral-900);
  color: var(--color-neutral-300);
  font-size: 13.5px;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.ptz-slot.saved {
  border-color: var(--color-accent-700);
  background: var(--color-accent-900);
  color: var(--color-accent);
  font-weight: 800;
}
.ptz-slot i {
  font-size: 13px;
  color: var(--color-accent-300);
}
.ptz-hint {
  font-size: 11.8px;
  color: var(--color-neutral-400);
  line-height: 1.45;
}
.ptz-hint.err { color: #e07a86; }

/* — 자동 순찰 — */
.patrol-card {
  border-radius: 12px;
  background: var(--color-neutral-900);
  display: flex;
  flex-direction: column;
}
.patrol-head {
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
.patrol-icon {
  flex: none;
  font-size: 17px;
  color: var(--color-neutral-400);
}
.patrol-copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.patrol-title {
  font-size: 13.5px;
  font-weight: 700;
}
.patrol-sub {
  font-size: 11.3px;
  color: var(--color-neutral-500);
}
.patrol-value {
  flex: none;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--color-neutral-500);
  white-space: nowrap;
}
.patrol-value.on { color: var(--color-accent); }
.patrol-caret {
  flex: none;
  font-size: 13px;
  color: var(--color-neutral-600);
}
.patrol-detail {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 0 16px 14px;
}
.patrol-label {
  font-size: 11px;
  color: var(--color-neutral-500);
}
.patrol-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.patrol-opt {
  height: 40px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: var(--color-neutral-800);
  color: var(--color-neutral-300);
  font-size: 12.3px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.patrol-opt.on {
  border-color: var(--color-accent-700);
  background: var(--color-accent-900);
  color: var(--color-accent);
  font-weight: 800;
}
</style>
