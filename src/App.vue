<script setup>
import { watch } from 'vue'
import SessionExpiryModal from './components/SessionExpiryModal.vue'
import { useAuth } from './composables/useAuth.js'
import { useTheme } from './composables/useTheme.js'
import { setAndroidStatusBarColor } from './composables/useAndroidStatusBar.js'

const { warningVisible, remainingSeconds, canExtendSession, extendingSession, extendSession, logout } = useAuth()

// 모든 화면이 --color-bg 하나를 페이지 배경으로 쓰므로 상태바 색은 앱 수준에서 한 번만 맞춘다.
const STATUS_BAR = { light: '#f6f6f7', dark: '#1e1e20' }
const { theme } = useTheme()
watch(theme, (t) => setAndroidStatusBarColor(STATUS_BAR[t]).catch(() => {}), { immediate: true })

async function handleExtend() {
  await extendSession()
}

function handleLogout() {
  logout({ redirect: true })
}
</script>

<template>
  <router-view />
  <SessionExpiryModal
    :show="warningVisible"
    :remaining-seconds="remainingSeconds"
    :can-extend="canExtendSession"
    :extending="extendingSession"
    @extend="handleExtend"
    @logout="handleLogout"
  />
</template>
