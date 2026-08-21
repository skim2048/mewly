<script setup>
import { computed } from 'vue'
import { useLocale } from '../composables/useLocale.js'
import { useTheme } from '../composables/useTheme.js'
import { useProfile, breedLabel } from '../composables/useProfile.js'

const emit = defineEmits(['open-modal', 'open-overlay', 'logout'])

const { t, locale, toggleLocale } = useLocale()
const { theme, setTheme } = useTheme()
const { profile, ageText } = useProfile()

// 빈 프로필이면 등록 안내를, 아니면 있는 항목만 「 · 」로 잇는다
const profileSub = computed(() => {
  const parts = [profile.value.breed && breedLabel(profile.value.breed, locale.value), ageText.value]
    .filter(Boolean)
  return parts.length ? parts.join(' · ') : t('profile.empty')
})

const langValue = computed(() => (locale.value === 'ko' ? '한국어' : 'English'))
const themeValue = computed(() =>
  theme.value === 'dark' ? t('dashboard.theme.dark') : t('dashboard.theme.light'),
)

function toggleTheme() {
  setTheme(theme.value === 'light' ? 'dark' : 'light')
}

const group1 = computed(() => [
  { key: 'notif', icon: 'ph ph-bell', label: t('notif.title'), onClick: () => emit('open-overlay', 'notifSettings') },
  { key: 'camera', icon: 'ph ph-video-camera', label: t('set.rowCam'), onClick: () => emit('open-modal', 'camera') },
  { key: 'prompt', icon: 'ph ph-lightbulb', label: t('set.rowPrompt'), onClick: () => emit('open-modal', 'prompt') },
  { key: 'analysis', icon: 'ph ph-chart-bar', label: t('set.rowAnalysis'), onClick: () => emit('open-modal', 'analysis') },
  { key: 'resources', icon: 'ph ph-cpu', label: t('set.rowRes'), onClick: () => emit('open-modal', 'resources') },
  { key: 'lang', icon: 'ph ph-translate', label: t('set.language'), value: langValue.value, onClick: toggleLocale },
  { key: 'theme', icon: 'ph ph-moon', label: t('set.theme'), value: themeValue.value, onClick: toggleTheme },
])
const group2 = computed(() => [
  { key: 'password', icon: 'ph ph-password', label: t('set.rowPw'), onClick: () => emit('open-modal', 'password') },
  { key: 'server', icon: 'ph ph-hard-drives', label: t('set.rowServer'), onClick: () => emit('open-modal', 'server') },
])
</script>

<template>
  <div class="settings-tab">

    <button class="profile-card" @click="emit('open-overlay', 'profile')">
      <span class="profile-avatar">
        <img v-if="profile.photo" :src="profile.photo" alt="">
        <i v-else class="ph ph-dog"></i>
      </span>
      <span class="profile-copy">
        <span class="profile-name">{{ profile.name || t('profile.title') }}</span>
        <span class="profile-sub">{{ profileSub }}</span>
      </span>
      <i class="ph ph-caret-right caret"></i>
    </button>

    <div class="row-card">
      <button
        v-for="(row, i) in group1"
        :key="row.key"
        class="row-item"
        :class="{ divided: i < group1.length - 1 }"
        @click="row.onClick"
      >
        <i :class="row.icon"></i>
        <span class="row-label">{{ row.label }}</span>
        <span v-if="row.value" class="row-value">{{ row.value }}</span>
        <i class="ph ph-caret-right caret"></i>
      </button>
    </div>

    <div class="row-card">
      <button
        v-for="row in group2"
        :key="row.key"
        class="row-item divided"
        @click="row.onClick"
      >
        <i :class="row.icon"></i>
        <span class="row-label">{{ row.label }}</span>
        <i class="ph ph-caret-right caret"></i>
      </button>
      <button class="row-item" @click="emit('logout')">
        <i class="ph ph-sign-out"></i>
        <span class="row-label">{{ t('dashboard.menu.logout') }}</span>
      </button>
    </div>

  </div>
</template>

<style scoped>
.settings-tab {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 2px 16px 12px;
}

.profile-card {
  flex: none;
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 14px;
  border-radius: 12px;
  border: none;
  background: var(--color-neutral-900);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}
.profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.profile-avatar {
  flex: none;
  width: 52px; height: 52px;
  border-radius: 26px;
  background: var(--color-neutral-800);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-neutral-500);
  font-size: 22px;
}
.profile-copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.profile-name {
  font-size: var(--font-title);
  font-weight: 700;
  color: var(--color-text);
}
.profile-sub {
  font-size: var(--font-label);
  color: var(--color-neutral-400);
}
.caret {
  color: var(--color-neutral-600);
  font-size: var(--font-body);
}

.row-card {
  flex: none;
  border-radius: 12px;
  background: var(--color-neutral-900);
  display: flex;
  flex-direction: column;
}
.row-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: none;
  background: none;
  cursor: pointer;
  font-family: inherit;
  color: var(--color-text);
  font-size: var(--font-body);
}
.row-item.divided { border-bottom: 1px solid var(--color-divider); }
/* 설정 리스트 행 프레스 피드백 — 네이티브 설정 화면의 표준 감각 */
.row-item:active { background: var(--bg-surface-active); }
.row-item > i:first-child {
  font-size: 17px;
  color: var(--color-neutral-400);
}
.row-label {
  flex: 1;
  text-align: left;
}
.row-value {
  font-size: var(--font-label);
  color: var(--color-neutral-400);
  white-space: nowrap;
}
</style>
