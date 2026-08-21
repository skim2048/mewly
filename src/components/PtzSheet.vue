<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import SheetFrame from './SheetFrame.vue'
import { useSSE } from '../composables/useSSE.js'
import { usePtz } from '../composables/usePtz.js'
import { useToast } from '../composables/useToast.js'
import { useLocale } from '../composables/useLocale.js'
import { tapLight } from '../native/init.js'

const props = defineProps({
  active: { type: Boolean, default: false }, // 재생 중 여부 — 낙관적 활성 정책의 사전 비활성 판단
})
const emit = defineEmits(['close'])

const { state } = useSSE()
const { speedLevel, setSpeedLevel, stopMove, moveAbsolute, savePreset, gotoPreset, setPatrol } = usePtz()
const { showToast } = useToast()
const { t, locale } = useLocale()

const ptzPressing = ref(null)
const ptzSaveMode = ref(false)
const ptzMessage = ref('') // '' | 'saveFailed' | 'gotoEmpty'
const patrolOpen = ref(false)

// 줌 — 백엔드 미지원, 로컬 값 표시만 (시안 ×1.0–8.0, 0.5 단위)
const zoom = ref(1)
const zoomFill = computed(() => {
  const pct = ((zoom.value - 1) / 7) * 100
  return `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-neutral-800) ${pct}%)`
})

// 시안: 마지막으로 선택(이동·저장)한 프리셋을 강조한다. 초기값은 순찰이
// 마지막으로 이동시킨 슬롯(SSE)을 따라 실제 카메라 위치와 어긋나지 않게 한다.
const selectedPreset = ref(state.ptz_patrol?.slot ?? 1)

const ptzDirs = [
  { id: 'up',    pan:  0, tilt:  1 },
  { id: 'down',  pan:  0, tilt: -1 },
  { id: 'left',  pan: -1, tilt:  0 },
  { id: 'right', pan:  1, tilt:  0 },
]

// @claude 방향 제어는 0.05 단위의 절대 이동 스텝이다(사용자 확정). 누르고
// @claude 있으면 이동 속도에 따른 주기로 스텝을 반복한다. 목표값 누적은
// @claude 게이지와 같은 hold 값을 기준으로 하여 SSE 지연에 흔들리지 않는다.
const PTZ_STEP = 0.05
const STEP_REPEAT_MS = { 1: 450, 2: 200 } // 보통·고속
let stepTimer = null

function clampAxis(v) {
  return Math.max(-1, Math.min(1, Math.round(v * 100) / 100))
}

function stepOnce(dir) {
  const pan = clampAxis((effPan.value ?? 0) + dir.pan * PTZ_STEP)
  const tilt = clampAxis((effTilt.value ?? 0) + dir.tilt * PTZ_STEP)
  holdAxis('pan', pan)
  holdAxis('tilt', tilt)
  moveAbsolute(pan, tilt)
}

function ptzDown(dir, event) {
  // 순찰 중에는 수동 팬·틸트 조작을 차단하고, 탭 시 사유를 토스트로 안내한다
  if (patrolEnabled.value) {
    showToast('patrolLock')
    return
  }
  if (!props.active) return
  event.preventDefault()
  tapLight()
  ptzPressing.value = dir.id
  stepOnce(dir)
  clearInterval(stepTimer)
  stepTimer = setInterval(() => stepOnce(dir), STEP_REPEAT_MS[speedLevel.value] ?? 450)
}

function ptzUp(dir) {
  if (ptzPressing.value !== dir.id) return
  ptzPressing.value = null
  clearInterval(stepTimer)
}

function ptzStopNow() {
  if (patrolEnabled.value) {
    showToast('patrolLock')
    return
  }
  if (!props.active) return
  ptzPressing.value = null
  clearInterval(stepTimer)
  stopMove()
}

async function onPresetClick(slot) {
  // 순찰 중에는 수동 프리셋 조작을 차단한다 (사용자 확정)
  if (!props.active || patrolEnabled.value) return
  ptzMessage.value = ''
  selectedPreset.value = slot
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

// — 자동 순찰 (FR-052) — 상태는 SSE ptz_patrol이 진실이다.
const PATROL_INTERVALS = [0, 10, 30, 60, 300, 600]
function intervalLabel(sec) {
  if (sec === 0) return t('ptz.patrolOff')
  if (sec < 60) return locale.value === 'en' ? `${sec}s` : `${sec}초`
  return locale.value === 'en' ? `${sec / 60}m` : `${sec / 60}분`
}
const patrolEnabled = computed(() => !!state.ptz_patrol?.enabled)
const patrolInterval = computed(() => state.ptz_patrol?.interval_s ?? 30)
// 순찰이 현재 순회 중인 슬롯 — 순찰 중 프리셋 하이라이팅의 기준
const patrolSlot = computed(() => state.ptz_patrol?.slot ?? null)

// @claude 순찰을 끄면 서버가 카메라를 프리셋 1로 복귀시키고 slot=1을
// @claude 내려준다(사용자 확정). 그 값을 수동 선택값으로 승계하여
// @claude 하이라이팅이 실제 위치를 가리키게 한다.
watch(patrolEnabled, (on, was) => {
  if (was && !on && patrolSlot.value != null) selectedPreset.value = patrolSlot.value
})

// @claude 간격 선택은 백엔드 적용 결과가 SSE로 되돌아올 때까지 지연이 있다.
// @claude 그동안 클릭한 버튼 안에 프로그레스 써클을 표시한다.
const patrolPending = ref(null) // null | 선택한 초 값(0 = 사용 안 함)
let patrolPendingTimer = null

watch(() => state.ptz_patrol, (p) => {
  if (patrolPending.value == null) return
  const applied = patrolPending.value === 0
    ? !p?.enabled
    : p?.enabled && p?.interval_s === patrolPending.value
  if (applied) {
    clearTimeout(patrolPendingTimer)
    patrolPending.value = null
  }
}, { deep: true })
const patrolValue = computed(() =>
  patrolEnabled.value ? intervalLabel(patrolInterval.value) : t('common.off'),
)
async function pickInterval(sec) {
  if (patrolPending.value != null) return
  patrolPending.value = sec
  // 응답 유실 대비: 5초가 지나면 표시를 거둔다(상태는 SSE가 진실).
  clearTimeout(patrolPendingTimer)
  patrolPendingTimer = setTimeout(() => { patrolPending.value = null }, 5000)
  const ok = sec === 0 ? await setPatrol(false) : await setPatrol(true, sec)
  if (!ok) {
    clearTimeout(patrolPendingTimer)
    patrolPending.value = null
  }
}

// — 팬·틸트 게이지 (SSE ptz_pan/ptz_tilt, -1~1, 2초 주기 폴링 값) —
// @claude 노브 드래그로 절대 이동을 명령한다. 드래그 중과 전송 직후에는
// @claude 로컬 값을 우선하여 SSE 폴링 값이 노브를 되돌리지 않게 한다.
const panHold = ref(null)
const tiltHold = ref(null)
let panHoldTimer = null
let tiltHoldTimer = null

const effPan = computed(() => panHold.value ?? state.ptz_pan)
const effTilt = computed(() => tiltHold.value ?? state.ptz_tilt)

function gaugeLabel(v) {
  return v == null ? '—' : v.toFixed(2)
}

// 눈금 위치(%) — 팬·틸트는 0.1 간격(-1~1, 21개; 이동 단위는 0.05 유지), 줌은 정수 간격(×1~×8)
const GAUGE_TICKS = Array.from({ length: 21 }, (_, i) => (i / 20) * 100)
const ZOOM_TICKS = Array.from({ length: 8 }, (_, i) => (i / 7) * 100)
function gaugeFill(v) {
  const pct = (((v ?? 0) + 1) / 2) * 100
  return `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-neutral-800) ${pct}%)`
}

// @claude 로컬 목표값 고정의 해제는 시간이 아니라 수렴 기준이다: SSE 값이
// @claude 목표의 허용 오차 안에 들어오면 풀린다. 시간 해제는 이동 중 표본이
// @claude 남아 있는 시점에 노브가 낡은 값으로 튀는 원인이었다. 응답 유실에
// @claude 대비한 상한 타이머만 예비로 둔다.
const HOLD_EPS = 0.03
const HOLD_MAX_MS = 8000

function holdAxis(axis, v) {
  if (axis === 'pan') {
    panHold.value = v
    clearTimeout(panHoldTimer)
    panHoldTimer = setTimeout(() => { panHold.value = null }, HOLD_MAX_MS)
  } else {
    tiltHold.value = v
    clearTimeout(tiltHoldTimer)
    tiltHoldTimer = setTimeout(() => { tiltHold.value = null }, HOLD_MAX_MS)
  }
}

watch(() => state.ptz_pan, (v) => {
  if (panHold.value != null && v != null && Math.abs(v - panHold.value) <= HOLD_EPS) {
    clearTimeout(panHoldTimer)
    panHold.value = null
  }
})
watch(() => state.ptz_tilt, (v) => {
  if (tiltHold.value != null && v != null && Math.abs(v - tiltHold.value) <= HOLD_EPS) {
    clearTimeout(tiltHoldTimer)
    tiltHold.value = null
  }
})

function onGaugeInput(axis, e) {
  const v = parseFloat(e.target.value)
  if (axis === 'pan') panHold.value = v
  else tiltHold.value = v
}

// 놓는 시점에만 전송 — 드래그 중 연발을 막는다.
function onGaugeChange(axis, e) {
  if (!props.active || patrolEnabled.value) return
  holdAxis(axis, parseFloat(e.target.value))
  moveAbsolute(effPan.value ?? 0, effTilt.value ?? 0)
}

onBeforeUnmount(() => {
  clearTimeout(panHoldTimer)
  clearTimeout(tiltHoldTimer)
  clearInterval(stepTimer)
})

// — 프리셋 좌표 (SSE ptz_preset_positions: slot -> {pan, tilt}) —
function slotValue(slot) {
  const p = state.ptz_preset_positions?.[slot] ?? state.ptz_preset_positions?.[String(slot)]
  return p ? `${p.pan}, ${p.tilt}` : '—'
}

function onClose() {
  clearInterval(stepTimer)
  emit('close')
}

onBeforeUnmount(() => clearTimeout(patrolPendingTimer))
</script>

<template>
  <SheetFrame title="PTZ" @close="onClose">
    <div class="ptz-sheet" :class="{ off: !active }" :aria-disabled="!active">

      <div class="ptz-top">
        <div class="ptz-pad-col">
          <!-- 사용자 확정: D-Pad의 구역 타이틀 (탭 이름 PTZ와 중첩 회피) -->
          <span class="ptz-row-label pad-title">{{ t('ptz.direction') }}</span>
          <div class="ptz-pad">
            <button
              v-for="dir in ptzDirs"
              :key="dir.id"
              class="ptz-dir"
              :class="[dir.id, { pressing: ptzPressing === dir.id, off: patrolEnabled }]"
              :aria-label="t(`live.ptz.${dir.id}`)"
              @pointerdown="(e) => ptzDown(dir, e)"
              @pointerup="ptzUp(dir)"
              @pointercancel="ptzUp(dir)"
              @pointerleave="ptzUp(dir)"
            ><i :class="`ph ph-caret-${dir.id}`"></i></button>
            <!-- 사용자 확정: 중앙 버튼은 STOP(이동 정지) -->
            <button class="ptz-stop" :class="{ off: patrolEnabled }" :aria-label="t('live.ptz.stop')" @click="ptzStopNow">STOP</button>
          </div>
        </div>

        <!-- 우측 열: 팬 → 틸트 → 줌 → 이동 속도 (사용자 확정) -->
        <div class="ptz-mid">
          <!-- 팬·틸트: 현재 위치(SSE, -1~1) 게이지 겸 절대 이동 조작 -->
          <div class="ptz-gauge">
            <div class="ptz-row-head">
              <span>{{ t('ptz.pan') }}</span>
              <span class="gauge-val">{{ gaugeLabel(effPan) }}</span>
            </div>
            <div class="gauge-ctl">
              <i class="ph ph-minus"></i>
              <div class="gauge-bar">
                <input
                  type="range"
                  class="ctl-range gauge"
                  min="-1"
                  max="1"
                  step="0.05"
                  :value="effPan ?? 0"
                  :disabled="patrolEnabled"
                  :style="{ backgroundImage: gaugeFill(effPan) }"
                  @input="(e) => onGaugeInput('pan', e)"
                  @change="(e) => onGaugeChange('pan', e)"
                />
                <div class="tick-row">
                  <span v-for="x in GAUGE_TICKS" :key="x" class="tick" :style="{ left: `${x}%` }"></span>
                </div>
              </div>
              <i class="ph ph-plus"></i>
            </div>
          </div>
          <div class="ptz-gauge">
            <div class="ptz-row-head">
              <span>{{ t('ptz.tilt') }}</span>
              <span class="gauge-val">{{ gaugeLabel(effTilt) }}</span>
            </div>
            <div class="gauge-ctl">
              <i class="ph ph-minus"></i>
              <div class="gauge-bar">
                <input
                  type="range"
                  class="ctl-range gauge"
                  min="-1"
                  max="1"
                  step="0.05"
                  :value="effTilt ?? 0"
                  :disabled="patrolEnabled"
                  :style="{ backgroundImage: gaugeFill(effTilt) }"
                  @input="(e) => onGaugeInput('tilt', e)"
                  @change="(e) => onGaugeChange('tilt', e)"
                />
                <div class="tick-row">
                  <span v-for="x in GAUGE_TICKS" :key="x" class="tick" :style="{ left: `${x}%` }"></span>
                </div>
              </div>
              <i class="ph ph-plus"></i>
            </div>
          </div>

          <!-- 줌 — 시안 사양의 활성 슬라이더. 백엔드 줌 미지원이라 값 표시만 한다(형태만 방침). -->
          <div class="ptz-gauge">
            <div class="ptz-row-head">
              <span>{{ t('live.ptz.zoom') }}</span>
              <span class="gauge-val">×{{ zoom.toFixed(1) }}</span>
            </div>
            <div class="gauge-ctl">
              <i class="ph ph-minus"></i>
              <div class="gauge-bar">
                <input
                  v-model.number="zoom"
                  type="range"
                  class="ctl-range zoom"
                  min="1"
                  max="8"
                  step="0.5"
                  :disabled="patrolEnabled"
                  :style="{ backgroundImage: zoomFill }"
                />
                <div class="tick-row">
                  <span v-for="x in ZOOM_TICKS" :key="x" class="tick" :style="{ left: `${x}%` }"></span>
                </div>
              </div>
              <i class="ph ph-plus"></i>
            </div>
          </div>
        </div>
      </div>

      <!-- 이동 속도: 방향 제어+PTZ 컨테이너 아래 전체 폭 (사용자 확정) -->
      <div class="ptz-speed">
        <span class="ptz-row-label">{{ t('live.ptz.speed') }}</span>
        <div class="ptz-speed-seg">
          <button
            v-for="(opt, i) in speedOptions"
            :key="opt.level"
            class="ptz-speed-opt"
            :class="{ active: speedLevel === opt.level, first: i === 0 }"
            :disabled="patrolEnabled"
            @click="setSpeedLevel(opt.level)"
          >{{ opt.label }}</button>
        </div>
      </div>

      <div class="ptz-presets">
        <div class="ptz-presets-head">
          <span class="ptz-row-label">{{ patrolEnabled ? t('ptz.presetsPatrolling') : t('live.ptz.presets') }}</span>
          <button
            class="ptz-save-toggle"
            :disabled="patrolEnabled"
            @click="ptzSaveMode = !ptzSaveMode; ptzMessage = ''"
          >
            <i v-if="!ptzSaveMode" class="ph ph-gear-six"></i>
            {{ ptzSaveMode ? t('live.ptz.saveCancel') : t('live.ptz.savePosition') }}
          </button>
        </div>
        <!-- 순찰 중: 수동 조작 차단, 하이라이팅은 순회 중인 슬롯을 따른다 -->
        <div class="ptz-slots">
          <button
            v-for="slot in [1, 2, 3, 4]"
            :key="slot"
            class="ptz-slot"
            :class="{ on: patrolEnabled ? patrolSlot === slot : selectedPreset === slot }"
            :disabled="patrolEnabled"
            @click="onPresetClick(slot)"
          >
            <span class="slot-top">
              <i v-if="ptzSaveMode" class="ph ph-bookmark-simple"></i>{{ slot }}
            </span>
            <span class="slot-val">{{ slotValue(slot) }}</span>
          </button>
        </div>
        <span class="ptz-hint" :class="{ err: !!ptzMessage }">{{ ptzHint }}</span>
      </div>

      <!-- 자동 순찰 (FR-052) — 프리셋을 간격마다 순회, 서버 측 루프 -->
      <div class="collapse-card">
        <button class="collapse-head" @click="patrolOpen = !patrolOpen">
          <i class="ph ph-path collapse-icon"></i>
          <span class="collapse-copy">
            <span class="collapse-title">{{ t('ptz.patrol') }}</span>
            <span class="collapse-sub">{{ patrolEnabled ? t('ptz.patrolSub') : t('ptz.patrolOffSub') }}</span>
          </span>
          <span class="collapse-value" :class="{ on: patrolEnabled }">{{ patrolValue }}</span>
          <i :class="patrolOpen ? 'ph ph-caret-up' : 'ph ph-caret-down'" class="collapse-caret"></i>
        </button>
        <div v-if="patrolOpen" class="collapse-detail">
          <span class="patrol-label">{{ t('ptz.patrolInterval') }}</span>
          <div class="patrol-grid">
            <button
              v-for="sec in PATROL_INTERVALS"
              :key="sec"
              class="patrol-opt"
              :class="{ on: sec === 0 ? !patrolEnabled : patrolEnabled && patrolInterval === sec }"
              @click="pickInterval(sec)"
            >
              <span v-if="patrolPending === sec" class="opt-spin"></span>
              <template v-else>{{ intervalLabel(sec) }}</template>
            </button>
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
/* 우측 열을 D-Pad 열 높이에 맞춰 늘이고, 줌·이동 속도를 상하 끝에 분배한다 */
.ptz-top {
  display: flex;
  gap: 16px;
  align-items: stretch;
  padding-top: 6px;
}
.ptz-pad-col {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.pad-title { align-self: flex-start; }
.ptz-gauge {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.gauge-ctl {
  display: flex;
  align-items: center;
  gap: 10px;
}
.gauge-ctl > i {
  flex: none;
  font-size: 14px;
  color: var(--color-neutral-500);
}
.gauge-bar {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.gauge-bar input { width: 100%; min-width: 0; }
/* 노브 반경(11px)만큼 안쪽으로 들여 트랙 좌표와 일치시키고, 노브 아래에 둔다 */
.tick-row {
  position: relative;
  height: 5px;
  margin: 5px 11px 0;
}
.tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  width: 1px;
  height: 5px;
  background: var(--color-neutral-700);
}
.ptz-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--font-label);
  color: var(--color-neutral-400);
}
.ptz-gauge input { width: 100%; min-width: 0; }
.gauge-val {
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
}
/* 순찰 중에는 다른 조작과 같이 흐림 처리한다 */
.ctl-range.gauge:disabled,
.ctl-range.zoom:disabled {
  opacity: 0.45;
  cursor: default;
}
.ptz-pad {
  position: relative;
  width: 156px;
  height: 156px;
  flex: none;
  border-radius: 50%;
  background: var(--color-neutral-900);
  border: 1px solid var(--color-neutral-800);
  box-sizing: border-box;
}
.ptz-dir {
  position: absolute;
  width: 46px; height: 46px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 21px;
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
  width: 58px; height: 58px;
  border-radius: 50%;
  border: 1px solid var(--color-accent-700);
  background: var(--color-accent-900);
  color: var(--color-accent);
  font-size: var(--font-label);
  font-weight: 700;
  letter-spacing: 0.04em;
  font-family: inherit;
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
  justify-content: space-between;
  gap: 14px;
}
.ptz-speed {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: -6px;
}
.ptz-row-label {
  font-size: var(--font-label);
  color: var(--color-neutral-400);
}
/* 우측 열 전체 폭을 두 버튼이 절반씩 차지한다 — 줌 슬라이더와 끝선 정렬 */
.ptz-speed-seg {
  display: flex;
  align-self: stretch;
  border-radius: 8px;
  overflow: hidden;
}
.ptz-speed-opt {
  flex: 1;
  min-width: 0;
  height: 38px;
  padding: 0;
  border: 1px solid var(--color-neutral-800);
  background: transparent;
  color: var(--color-neutral-400);
  font-size: var(--font-label);
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
  font-size: var(--font-label);
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
  font-family: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.ptz-slot.on {
  border-color: var(--color-accent-700);
  background: var(--color-accent-900);
  color: var(--color-accent);
}
/* 순찰 중 수동 조작 차단 — 순회 중인 슬롯(.on)의 하이라이팅은 유지한다 */
.ptz-slot:disabled { cursor: default; }
.ptz-slot:disabled:not(.on) { opacity: 0.45; }
.ptz-save-toggle:disabled,
.ptz-dir.off,
.ptz-stop.off,
.ptz-speed-opt:disabled {
  opacity: 0.45;
  cursor: default;
}
.ptz-slot.on .slot-top { font-weight: 800; }
.slot-top {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: var(--font-body);
  font-variant-numeric: tabular-nums;
}
.slot-top i {
  font-size: 13px;
  color: var(--color-accent-300);
}
.slot-val {
  font-size: var(--font-caption);
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
}
.ptz-hint {
  font-size: var(--font-label);
  color: var(--color-neutral-400);
  line-height: 1.45;
  text-align: right;
}
.ptz-hint.err { color: var(--color-text); }

/* — 자동 순찰 세부 — */
.patrol-label {
  font-size: var(--font-caption);
  color: var(--color-neutral-400);
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
  font-size: var(--font-label);
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
/* 백엔드 적용 대기 중 프로그레스 써클 */
.patrol-opt { position: relative; }
.opt-spin {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--color-neutral-700);
  border-top-color: var(--color-accent);
  vertical-align: middle;
  animation: opt-sp 0.8s linear infinite;
}
@keyframes opt-sp {
  to { transform: rotate(360deg); }
}
</style>
