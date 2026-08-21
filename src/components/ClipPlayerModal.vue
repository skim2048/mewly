<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useLocale } from '../composables/useLocale.js'
import { onBackButton } from '../native/backButton.js'
import { setStatusBarHidden } from '../native/init.js'

const props = defineProps({
  open: Boolean,
  src: {
    type: String,
    required: true,
  },
  // 시안: 재생 카드에 촬영 시점(일자·시각)과 추론 문장을 함께 표시한다.
  title: { type: String, default: '' },
  desc: { type: String, default: '' },
})

const emit = defineEmits(['close'])
const { t } = useLocale()

const playerEl = ref(null)
const playerPlaying = ref(false)
const playerCurrentTime = ref(0)
const playerDuration = ref(0)
const fullscreen = ref(false)

// @claude Android 뒤로가기: 열려 있는 동안만 등록 — 풀스크린이면 풀스크린만
// @claude 해제하고, 아니면 플레이어를 닫는다(MainView는 이 모달을 못 본다).
let offBack = null
watch(() => props.open, async (open) => {
  if (open) {
    document.addEventListener('keydown', onKeydown)
    offBack ??= onBackButton(() => {
      if (fullscreen.value) { fullscreen.value = false; return true }
      closePlayer()
      return true
    })
    await nextTick()
    const vid = playerEl.value
    if (!vid) return
    vid.currentTime = 0
    await vid.play().catch(() => {})
    return
  }
  document.removeEventListener('keydown', onKeydown)
  offBack?.()
  offBack = null
  resetPlayer()
})

// 영상 풀스크린 동안 상태바 숨김 (HomeTab과 동일 규칙)
watch(fullscreen, (fs) => setStatusBarHidden(fs))

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  offBack?.()
  offBack = null
  setStatusBarHidden(false)
  resetPlayer()
})

function closePlayer() {
  emit('close')
}

function resetPlayer() {
  const vid = playerEl.value
  if (vid) {
    vid.pause()
    vid.currentTime = 0
  }
  playerPlaying.value = false
  playerCurrentTime.value = 0
  playerDuration.value = 0
  fullscreen.value = false
}

function togglePlayerPlay() {
  const vid = playerEl.value
  if (!vid) return
  if (vid.paused) vid.play()
  else vid.pause()
}

function onPlayerPlay() { playerPlaying.value = true }
function onPlayerPause() { playerPlaying.value = false }
function onPlayerEnded() {
  playerPlaying.value = false
  playerCurrentTime.value = 0
  if (playerEl.value) playerEl.value.currentTime = 0
}
function onLoadedMetadata() {
  playerDuration.value = playerEl.value?.duration ?? 0
}
function onTimeUpdate() {
  playerCurrentTime.value = playerEl.value?.currentTime ?? 0
}

function seekTo(e) {
  const vid = playerEl.value
  if (vid) vid.currentTime = Number(e.target.value)
}

function formatTime(s) {
  if (!s || isNaN(s)) return '00:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

const seekFill = computed(() => {
  const pct = playerDuration.value ? (playerCurrentTime.value / playerDuration.value) * 100 : 0
  return `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-neutral-800) ${pct}%)`
})

function onKeydown(e) {
  if (!props.open) return
  if (e.key === 'Escape') {
    if (fullscreen.value) fullscreen.value = false
    else closePlayer()
    return
  }
  if (e.key === ' ') {
    e.preventDefault()
    togglePlayerPlay()
    return
  }
  const vid = playerEl.value
  if (!vid) return
  if (e.key === 'ArrowLeft') vid.currentTime = Math.max(0, vid.currentTime - 5)
  if (e.key === 'ArrowRight') vid.currentTime = Math.min(vid.duration, vid.currentTime + 5)
}
</script>

<template>
  <teleport to="body">
    <div
      v-if="open"
      class="player-backdrop"
      :class="{ fs: fullscreen }"
      @click.self="closePlayer"
    >
      <!-- 시안: 카드형 모달. 전체화면 시 회전 캔버스로 전환된다. -->
      <div class="player-card" :class="{ fs: fullscreen }">
        <div class="rotor">
          <div class="videobox" @click="togglePlayerPlay">
            <video
              ref="playerEl"
              :src="src"
              playsinline
              @play="onPlayerPlay"
              @pause="onPlayerPause"
              @ended="onPlayerEnded"
              @loadedmetadata="onLoadedMetadata"
              @timeupdate="onTimeUpdate"
            ></video>

            <span v-if="!playerPlaying" class="play-ring"><i class="ph-fill ph-play"></i></span>

            <span v-if="fullscreen" class="fs-title">{{ title }}</span>
            <button
              v-if="!fullscreen"
              class="corner-btn expand"
              :aria-label="t('live.fullscreen.enter')"
              @click.stop="fullscreen = true"
            ><i class="ph ph-corners-out"></i></button>
            <button
              v-if="!fullscreen"
              class="corner-btn close-card"
              @click.stop="closePlayer"
            ><i class="ph ph-x"></i></button>
            <button
              v-if="fullscreen"
              class="corner-btn collapse"
              :aria-label="t('live.fullscreen.exit')"
              @click.stop="fullscreen = false"
            ><i class="ph ph-corners-in"></i></button>
            <button
              v-if="fullscreen"
              class="corner-btn close-fs"
              @click.stop="closePlayer"
            ><i class="ph ph-x"></i></button>
            <span v-if="!fullscreen" class="dur-chip">{{ formatTime(playerDuration) }}</span>

            <!-- 전체화면: 하단 시크 바 오버레이 -->
            <div v-if="fullscreen" class="fs-seek" @click.stop>
              <span>{{ formatTime(playerCurrentTime) }}</span>
              <input
                type="range"
                class="ctl-range"
                min="0"
                :max="playerDuration || 0"
                step="0.1"
                :value="playerCurrentTime"
                :style="{ backgroundImage: seekFill }"
                @input="seekTo"
              />
              <span>{{ formatTime(playerDuration) }}</span>
            </div>
          </div>

          <template v-if="!fullscreen">
            <div class="seek-row" @click.stop>
              <span>{{ formatTime(playerCurrentTime) }}</span>
              <input
                type="range"
                class="ctl-range"
                min="0"
                :max="playerDuration || 0"
                step="0.1"
                :value="playerCurrentTime"
                :style="{ backgroundImage: seekFill }"
                @input="seekTo"
              />
              <span>{{ formatTime(playerDuration) }}</span>
            </div>

            <!-- 시안: 일자·시각 + 「탭하여 닫기」 + 추론 문장 -->
            <div class="info-block" @click="closePlayer">
              <div class="info-head">
                <span class="info-title">{{ title }}</span>
                <span class="info-close">{{ t('rec.tapClose') }}</span>
              </div>
              <span v-if="desc" class="info-desc">{{ desc }}</span>
            </div>
          </template>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.player-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(8, 9, 14, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.player-backdrop.fs {
  background: #0b0c12;
  padding: 0;
}

.player-card {
  width: 100%;
  max-width: 480px;
  border-radius: 14px;
  overflow: hidden;
  background: var(--color-surface);
}
.player-card .rotor {
  display: flex;
  flex-direction: column;
}
.videobox {
  position: relative;
  aspect-ratio: 16 / 9;
  background: #000;
  cursor: pointer;
}
.videobox video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* 전체화면: 세로 기기에서 가로 캔버스로 회전 (시안 방식) */
.player-card.fs {
  position: fixed;
  inset: 0;
  max-width: none;
  border-radius: 0;
  background: #0b0c12;
  overflow: hidden;
}
.player-card.fs .rotor {
  position: absolute;
  inset: auto;
  top: 50%;
  left: 50%;
  width: 100vh;
  height: 100vw;
  transform: translate(-50%, -50%) rotate(90deg);
}
@media (orientation: landscape) {
  .player-card.fs .rotor {
    inset: 0;
    top: 0;
    left: 0;
    width: auto;
    height: auto;
    transform: none;
  }
}
.player-card.fs .videobox {
  aspect-ratio: auto;
  flex: 1;
  min-height: 0;
}

.play-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 56px; height: 56px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--color-accent);
  color: var(--color-accent);
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.corner-btn {
  position: absolute;
  border: none;
  background: rgba(0, 0, 0, 0.45);
  color: #e9e9ed;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 닫기(X)를 최우측에, 확대/축소를 그 왼쪽에 배치한다 */
.corner-btn.close-card {
  right: 8px; top: 8px;
  width: 32px; height: 32px;
  border-radius: 8px;
  font-size: 15px;
}
.corner-btn.expand {
  right: 46px; top: 8px;
  width: 32px; height: 32px;
  border-radius: 8px;
  font-size: 15px;
}
.corner-btn.close-fs {
  right: 14px; top: 12px;
  width: 36px; height: 36px;
  border-radius: 10px;
  font-size: 16px;
}
.corner-btn.collapse {
  right: 58px; top: 12px;
  width: 36px; height: 36px;
  border-radius: 10px;
  font-size: 16px;
}
.dur-chip {
  position: absolute;
  right: 8px; bottom: 8px;
  font-size: var(--font-caption);
  color: #e9e9ed;
  background: rgba(0, 0, 0, 0.5);
  padding: 2px 6px;
  border-radius: 4px;
  font-variant-numeric: tabular-nums;
}
.fs-title {
  position: absolute;
  left: 16px; top: 12px;
  font-size: var(--font-label);
  color: #e9e9ed;
  background: rgba(0, 0, 0, 0.45);
  padding: 3px 8px;
  border-radius: 6px;
  font-variant-numeric: tabular-nums;
}
.fs-seek {
  position: absolute;
  left: 16px; right: 16px; bottom: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--font-caption);
  color: rgba(233, 233, 237, 0.75);
  font-variant-numeric: tabular-nums;
}
.fs-seek input { flex: 1; min-width: 0; }

.seek-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 14px 0;
  font-size: var(--font-caption);
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
  cursor: default;
}
.seek-row input { flex: 1; min-width: 0; }

.info-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 14px 14px;
  cursor: pointer;
}
.info-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.info-title {
  flex: 1;
  font-size: var(--font-body);
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
}
.info-close {
  flex: none;
  font-size: var(--font-caption);
  color: var(--color-neutral-400);
}
.info-desc {
  font-size: var(--font-body);
  line-height: 1.5;
  color: var(--color-text);
}
</style>
