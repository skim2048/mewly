<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { useLocale } from '../composables/useLocale.js'
import { onBackButton } from '../native/backButton.js'
import { useProfile, BREEDS, BREED_OTHER, breedLabel } from '../composables/useProfile.js'
import OverlayFrame from './OverlayFrame.vue'
import { useToast } from '../composables/useToast.js'
import ui from '../../config/ui.json'

const emit = defineEmits(['close'])

const { t, locale } = useLocale()
const { profile, ageText, birthLabel, saveProfile } = useProfile()
const { showToast } = useToast()

// 저장: 서버(클라이언트 저장소) 반영 후 토스트로만 확인한다 (화면 유지, 닫기는 X)
const saving = ref(false)
async function onSave() {
  if (saving.value) return
  saving.value = true
  try {
    await saveProfile()
    showToast('profileSaved')
  } catch {
    showToast('profileSaveFail')
  } finally {
    saving.value = false
  }
}

const breedMode = ref(false)
const breedQuery = ref('')

// ── 프로필 사진 — 시스템 선택기로 받아 캔버스로 축소 후 data URL로 저장 ──
// @claude localStorage 용량(≈5MB)을 지키기 위해 긴 변 512px·JPEG 0.85로
// @claude 축소한다(수십~백여 KB). 새 선택은 기존 사진을 대체한다.
const photoInput = ref(null)

// ── 사진 크롭 모드 — 원형으로 남을 영역을 미리 보고 위치(드래그)·크기(슬라이더)를
// ── 지정한다(사용자 확정). 저장 시 뷰포트 정사각을 512px로 잘라 담는다.
const VIEW = ui.profilePhoto.cropViewPx // 크롭 뷰포트 한 변(CSS px)
const cropMode = ref(false)
const cropUrl = ref('')
const cropNat = ref({ w: 0, h: 0 })
const cropMin = ref(1)
const cropScale = ref(1)
const cropOffset = ref({ x: 0, y: 0 })

function onPhotoPicked(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // 같은 파일 재선택도 change가 발화하도록
  if (!file) return
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    cropNat.value = { w: img.width, h: img.height }
    const min = VIEW / Math.min(img.width, img.height) // 원이 항상 덮이는 최소 배율
    cropMin.value = min
    cropScale.value = min
    cropOffset.value = {
      x: (VIEW - img.width * min) / 2,
      y: (VIEW - img.height * min) / 2,
    }
    cropUrl.value = url
    cropMode.value = true
  }
  img.onerror = () => URL.revokeObjectURL(url)
  img.src = url
}

function clampOffset(o, scale = cropScale.value) {
  return {
    x: Math.min(0, Math.max(VIEW - cropNat.value.w * scale, o.x)),
    y: Math.min(0, Math.max(VIEW - cropNat.value.h * scale, o.y)),
  }
}

// 줌은 뷰포트 중심을 고정한 채 배율만 바꾼다
function onCropZoom(e) {
  const next = Number(e.target.value)
  const prev = cropScale.value
  const c = VIEW / 2
  const o = cropOffset.value
  cropOffset.value = clampOffset({
    x: c - ((c - o.x) / prev) * next,
    y: c - ((c - o.y) / prev) * next,
  }, next)
  cropScale.value = next
}

let dragFrom = null
function cropDown(e) {
  e.currentTarget.setPointerCapture?.(e.pointerId)
  dragFrom = { x: e.clientX - cropOffset.value.x, y: e.clientY - cropOffset.value.y }
}
function cropMove(e) {
  if (!dragFrom) return
  cropOffset.value = clampOffset({ x: e.clientX - dragFrom.x, y: e.clientY - dragFrom.y })
}
function cropUp() { dragFrom = null }

function cancelCrop() {
  cropMode.value = false
  if (cropUrl.value) URL.revokeObjectURL(cropUrl.value)
  cropUrl.value = ''
}

function confirmCrop() {
  const img = new Image()
  img.onload = () => {
    const s = cropScale.value
    const o = cropOffset.value
    const OUT = ui.profilePhoto.outputPx
    const canvas = document.createElement('canvas')
    canvas.width = OUT
    canvas.height = OUT
    canvas.getContext('2d').drawImage(img, -o.x / s, -o.y / s, VIEW / s, VIEW / s, 0, 0, OUT, OUT)
    profile.value = { ...profile.value, photo: canvas.toDataURL('image/jpeg', ui.profilePhoto.jpegQuality) }
    cancelCrop()
  }
  img.src = cropUrl.value
}

const cropImgStyle = computed(() => ({
  width: `${cropNat.value.w * cropScale.value}px`,
  height: `${cropNat.value.h * cropScale.value}px`,
  transform: `translate(${cropOffset.value.x}px, ${cropOffset.value.y}px)`,
}))
const cropZoomFill = computed(() => {
  const span = cropMin.value * 2 // max = min*3
  const pct = span ? ((cropScale.value - cropMin.value) / span) * 100 : 0
  return `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-neutral-800) ${pct}%)`
})

// ── 생일 수정 — 숨은 date 입력으로 네이티브 날짜 선택기를 연다 ──
const birthInput = ref(null)
function openBirthPicker() {
  const el = birthInput.value
  if (!el) return
  try { el.showPicker() } catch { el.click() }
}
function onBirthChange(e) {
  if (e.target.value) profile.value = { ...profile.value, birth: e.target.value }
}

const breedList = computed(() => {
  const q = breedQuery.value.trim().toLowerCase()
  return BREEDS
    .filter((b) => !q || b.ko.toLowerCase().includes(q) || b.en.toLowerCase().includes(q))
    .map((b) => ({
      value: b.ko,
      label: breedLabel(b.ko, locale.value),
      current: b.ko === profile.value.breed,
    }))
})
const breedEmpty = computed(() => breedQuery.value.trim() && !breedList.value.length)

function pickBreed(value) {
  profile.value = { ...profile.value, breed: value }
  closeBreedMode()
}

function closeBreedMode() {
  breedMode.value = false
  breedQuery.value = ''
}

// ── 프레임 모드 — 루트 OverlayFrame은 하나이고 제목·아이콘·닫기 동작만 바뀐다 ──
const mode = computed(() => (breedMode.value ? 'breed' : cropMode.value ? 'crop' : 'edit'))
const frameTitle = computed(() => ({
  breed: t('breed.pick'),
  crop: t('profile.cropTitle'),
  edit: t('profile.title'),
})[mode.value])
function onFrameClose() {
  if (mode.value === 'breed') closeBreedMode()
  else if (mode.value === 'crop') cancelCrop()
  else emit('close')
}

// Android 뒤로가기: 내부 모드(크롭·견종)를 먼저 닫는다. 프로필 편집 루트에서는
// 소비하지 않아 MainView의 핸들러가 오버레이를 닫는다.
const offBack = onBackButton(() => {
  if (cropMode.value) { cancelCrop(); return true }
  if (breedMode.value) { closeBreedMode(); return true }
  return false
})
onUnmounted(offBack)

// ── 특징 textarea — 내용 높이에 맞춰 자동 확장(rows=4가 최소 높이) ──
const notesInput = ref(null)
function autosizeNotes() {
  const el = notesInput.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
// 모드 전환(견종·크롭) 복귀 시 편집 분기가 재마운트되므로 ref 갱신마다 재계산
watch(notesInput, (el) => { if (el) autosizeNotes() })
</script>

<template>
  <!-- 단일 OverlayFrame 루트에 세 모드(견종 선택·사진 크롭·프로필 편집)를 담는다.
       모드마다 프레임을 분기하면 컴포넌트 루트 요소가 교체되고, 그때 MainView의
       <Transition name="layer"> 훅이 새 루트에 다시 걸려 개발 서버(주석 보존 →
       fragment 루트)에서 enter가 layer-enter-from 상태로 고착된다 — 화면 밖에
       머물러 창이 닫힌 것처럼 보인다. v-if 분기 간 동일 key는 컴파일러가
       금지하므로 루트 프레임을 하나로 유지한다. -->
  <OverlayFrame
    :title="frameTitle"
    :icon="mode === 'edit' ? 'x' : 'back'"
    @close="onFrameClose"
  >
    <template #actions>
      <button v-if="mode === 'crop'" class="head-save" @click="confirmCrop">{{ t('common.save') }}</button>
      <!-- 사용자 확정: 저장은 화면을 유지하고 토스트로만 확인한다 (닫기는 X) -->
      <button v-else-if="mode === 'edit'" class="head-save" :disabled="saving" @click="onSave">{{ t('common.save') }}</button>
    </template>

    <!-- 견종 선택 모드 -->
    <template v-if="mode === 'breed'">
      <div class="breed-search">
        <i class="ph ph-magnifying-glass"></i>
        <input v-model="breedQuery" :placeholder="t('breed.searchPh')">
      </div>
      <div class="breed-list">
        <div v-if="breedEmpty" class="breed-none">
          <span class="breed-none-text">{{ t('breed.none', { q: breedQuery.trim() }) }}</span>
          <span class="breed-none-hint">{{ t('breed.hint') }}</span>
          <button class="breed-etc" @click="pickBreed(BREED_OTHER.ko)">{{ t('breed.saveEtc') }}</button>
        </div>
        <button
          v-for="b in breedList"
          :key="b.value"
          class="breed-item"
          @click="pickBreed(b.value)"
        >
          <span>{{ b.label }}</span>
          <i v-if="b.current" class="ph-fill ph-check-circle"></i>
        </button>
      </div>
    </template>

    <!-- 사진 크롭 모드: 원형으로 남을 영역을 드래그·슬라이더로 지정 -->
    <div v-else-if="mode === 'crop'" class="crop-body">
      <div
        class="crop-stage"
        @pointerdown.prevent="cropDown"
        @pointermove="cropMove"
        @pointerup="cropUp"
        @pointercancel="cropUp"
      >
        <img :src="cropUrl" :style="cropImgStyle" alt="" draggable="false">
        <div class="crop-mask" aria-hidden="true"></div>
      </div>
      <span class="crop-hint">{{ t('profile.cropHint') }}</span>
      <input
        type="range"
        class="ctl-range"
        :min="cropMin"
        :max="cropMin * 3"
        :step="cropMin / 50"
        :value="cropScale"
        :style="{ backgroundImage: cropZoomFill }"
        @input="onCropZoom"
      >
    </div>

    <!-- 프로필 편집 모드 -->
    <div v-else class="profile-body">
      <div class="photo-block">
        <button class="photo-wrap" :aria-label="t('profile.photoHint')" @click="photoInput?.click()">
          <span class="photo">
            <img v-if="profile.photo" :src="profile.photo" alt="">
            <i v-else class="ph ph-dog"></i>
          </span>
          <span class="photo-edit"><i class="ph ph-camera"></i></span>
        </button>
        <input
          ref="photoInput"
          type="file"
          accept="image/*"
          class="photo-input"
          @change="onPhotoPicked"
        >
        <span class="photo-hint">{{ t('profile.photoHint') }}</span>
      </div>

      <label class="field">{{ t('profile.name') }}
        <input v-model="profile.name">
        <span>{{ t('profile.nameHint') }}</span>
      </label>

      <div class="field">{{ t('profile.breed') }}
        <button class="field-row" @click="breedMode = true">
          <span class="field-value">{{ profile.breed ? breedLabel(profile.breed, locale) : '—' }}</span>
          <span class="field-note">{{ t('common.change') }}</span>
        </button>
      </div>

      <div class="field">{{ t('profile.birth') }}
        <button class="field-row" @click="openBirthPicker">
          <span class="field-value">{{ birthLabel }}</span>
          <span class="field-note">{{ ageText }}</span>
        </button>
        <input
          ref="birthInput"
          type="date"
          class="birth-input"
          :value="profile.birth"
          :max="new Date().toISOString().slice(0, 10)"
          @change="onBirthChange"
        >
      </div>

      <label class="field">{{ t('profile.notes') }}
        <textarea
          ref="notesInput"
          v-model="profile.notes"
          class="notes-input"
          rows="4"
          :placeholder="t('profile.notesPh')"
          @input="autosizeNotes"
        ></textarea>
      </label>
    </div>
  </OverlayFrame>
</template>

<style scoped>
.head-save {
  height: 38px;
  padding: 0 16px;
  border-radius: 100px;
  border: none;
  background: var(--color-accent-900);
  color: var(--color-text);
  font-size: var(--font-body);
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}

/* — 견종 선택 — */
.breed-search {
  flex: none;
  margin: 0 16px;
  height: 44px;
  border-radius: 100px;
  background: var(--color-neutral-900);
  display: flex;
  align-items: center;
  padding: 0 15px;
  gap: 8px;
}
.breed-search i {
  color: var(--color-neutral-500);
  font-size: 15px;
}
.breed-search input {
  flex: 1;
  border: none;
  background: none;
  color: var(--color-text);
  font-size: var(--font-body);
  font-family: inherit;
  outline: none;
}
.breed-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 16px;
  display: flex;
  flex-direction: column;
}
.breed-none {
  margin-top: 8px;
  border-radius: 10px;
  background: var(--color-neutral-900);
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.breed-none-text {
  font-size: var(--font-body);
  line-height: 1.55;
  color: var(--color-neutral-300);
}
.breed-none-hint {
  font-size: var(--font-label);
  color: var(--color-neutral-400);
}
.breed-etc {
  align-self: flex-start;
  margin-top: 4px;
  height: 36px;
  padding: 0 13px;
  border-radius: 8px;
  border: none;
  background: var(--color-neutral-800);
  color: var(--color-text);
  font-size: var(--font-body);
  cursor: pointer;
  font-family: inherit;
}
.breed-item {
  flex: none;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: none;
  background: none;
  color: var(--color-text);
  font-size: var(--font-body);
  font-family: inherit;
  cursor: pointer;
  padding: 0 4px;
  border-bottom: 1px solid var(--color-divider);
}
.breed-item i {
  color: var(--color-accent);
  font-size: 18px;
}

/* — 프로필 편집 — */
.profile-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.photo-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
}
.photo-wrap {
  position: relative;
  width: 100px; height: 100px;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
}
.photo-input { display: none; }
.photo img {
  width: 100%;
  height: 100%;
  border-radius: 50px;
  object-fit: cover;
}
.photo {
  position: absolute;
  inset: 0;
  border-radius: 50px;
  background: var(--color-neutral-800);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-neutral-500);
  font-size: 34px;
}
.photo-edit {
  position: absolute;
  right: -2px; bottom: -2px;
  width: 32px; height: 32px;
  border-radius: 16px;
  background: var(--color-neutral-700);
  border: 2px solid var(--color-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-body);
  color: var(--color-neutral-300);
}
.photo-hint {
  font-size: var(--font-label);
  color: var(--color-neutral-400);
  text-align: center;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  /* 필드 소제목은 공용 폼 라벨(.form-field)과 동일 사양 — 역할 통일 (실기 지적) */
  font-size: var(--font-body);
  font-weight: 700;
  color: var(--color-neutral-300);
}
.field > span:not(.field-row) {
  /* 라벨 아래 힌트는 힌트 역할 사양으로 복귀 */
  font-size: var(--font-label);
  font-weight: 400;
  color: var(--color-neutral-400);
}
.field .field-value { font-weight: 400; }
.field .field-note { font-weight: 400; }
.field input {
  height: 48px;
  border-radius: 10px;
  border: none;
  background: var(--color-neutral-900);
  color: var(--color-text);
  padding: 0 14px;
  font-size: var(--font-body);
  font-family: inherit;
  outline: none;
}
.field-row {
  height: 48px;
  border-radius: 10px;
  border: none;
  background: var(--color-neutral-900);
  padding: 0 14px;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.field-row.static { cursor: default; }
.field-value {
  font-size: var(--font-body);
  color: var(--color-text);
}
.field-note {
  font-size: var(--font-label);
  color: var(--color-neutral-400);
}
.birth-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.crop-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding-top: 12px;
}
.crop-stage {
  position: relative;
  width: 300px;
  height: 300px;
  overflow: hidden;
  border-radius: 12px;
  background: #000;
  touch-action: none;
  cursor: grab;
}
.crop-stage img {
  position: absolute;
  top: 0;
  left: 0;
  max-width: none;
  user-select: none;
  -webkit-user-drag: none;
}
/* 원 밖 영역을 어둡게 — 원형으로 남을 부분의 미리보기 */
.crop-mask {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 300px;
  height: 300px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
  pointer-events: none;
}
.crop-hint {
  font-size: var(--font-label);
  color: var(--color-neutral-400);
}
.crop-body .ctl-range {
  width: 300px;
}
.notes-input {
  border: none;
  border-radius: 10px;
  background: var(--color-neutral-900);
  color: var(--color-text);
  padding: 12px 14px;
  font-size: var(--font-body);
  font-weight: 400;
  font-family: inherit;
  line-height: 1.55;
  resize: none;
  outline: none;
  /* 높이는 입력 시 scrollHeight로 갱신 — 스크롤바 대신 확장 */
  overflow-y: hidden;
}
.notes-input::placeholder { color: var(--color-neutral-500); }
</style>
