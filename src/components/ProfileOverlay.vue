<script setup>
import { computed, ref } from 'vue'
import { useLocale } from '../composables/useLocale.js'
import { useProfile, BREEDS, BREED_OTHER, breedLabel } from '../composables/useProfile.js'
import OverlayFrame from './OverlayFrame.vue'

const emit = defineEmits(['close'])

const { t, locale } = useLocale()
const { profile, ageYears, birthLabel } = useProfile()

const breedMode = ref(false)
const breedQuery = ref('')

// ── 프로필 사진 — 시스템 선택기로 받아 캔버스로 축소 후 data URL로 저장 ──
// @claude localStorage 용량(≈5MB)을 지키기 위해 긴 변 512px·JPEG 0.85로
// @claude 축소한다(수십~백여 KB). 새 선택은 기존 사진을 대체한다.
const photoInput = ref(null)

function onPhotoPicked(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // 같은 파일 재선택도 change가 발화하도록
  if (!file) return
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    URL.revokeObjectURL(url)
    const MAX = 512
    const scale = Math.min(1, MAX / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    profile.value = { ...profile.value, photo: canvas.toDataURL('image/jpeg', 0.85) }
  }
  img.onerror = () => URL.revokeObjectURL(url)
  img.src = url
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
  breedMode.value = false
  breedQuery.value = ''
}
</script>

<template>
  <!-- 견종 선택 모드 -->
  <OverlayFrame
    v-if="breedMode"
    :title="t('breed.pick')"
    icon="back"
    @close="breedMode = false"
  >
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
  </OverlayFrame>

  <!-- 프로필 편집 모드 -->
  <OverlayFrame v-else :title="t('profile.title')" icon="x" @close="emit('close')">
    <template #actions>
      <button class="head-save" @click="emit('close')">{{ t('common.save') }}</button>
    </template>
    <div class="profile-body">
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
          <span class="field-value">{{ breedLabel(profile.breed, locale) }}</span>
          <span class="field-note">{{ t('common.change') }}</span>
        </button>
      </div>

      <div class="field">{{ t('profile.birth') }}
        <span class="field-row static">
          <span class="field-value">{{ birthLabel }}</span>
          <span class="field-note">{{ t('profile.age', { n: ageYears }) }}</span>
        </span>
      </div>
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
</style>
