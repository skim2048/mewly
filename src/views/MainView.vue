<script setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCamera } from '../composables/useCamera.js'
import { onBackButton } from '../native/backButton.js'
import { useAuth } from '../composables/useAuth.js'
import { useLocale } from '../composables/useLocale.js'
import { useStreamProtocol } from '../composables/useStreamProtocol.js'
import { useNotifications } from '../composables/useNotifications.js'
import { useToast } from '../composables/useToast.js'
import ModalFrame from '../components/ModalFrame.vue'
import HomeTab from '../components/HomeTab.vue'

const CalendarTab = defineAsyncComponent(() => import('../components/CalendarTab.vue'))
const AnalysisTab = defineAsyncComponent(() => import('../components/AnalysisTab.vue'))
const AnalysisPanel = defineAsyncComponent(() => import('../components/AnalysisPanel.vue'))
const SettingsTab = defineAsyncComponent(() => import('../components/SettingsTab.vue'))
const NotificationsOverlay = defineAsyncComponent(() => import('../components/NotificationsOverlay.vue'))
const ProfileOverlay = defineAsyncComponent(() => import('../components/ProfileOverlay.vue'))
const NotifSettingsOverlay = defineAsyncComponent(() => import('../components/NotifSettingsOverlay.vue'))
const ScheduleEditor = defineAsyncComponent(() => import('../components/ScheduleEditor.vue'))
const CameraPanel = defineAsyncComponent(() => import('../components/CameraPanel.vue'))
const ChangePasswordPanel = defineAsyncComponent(() => import('../components/ChangePasswordPanel.vue'))
const PromptSheet = defineAsyncComponent(() => import('../components/PromptSheet.vue'))
const PtzSheet = defineAsyncComponent(() => import('../components/PtzSheet.vue'))
const ResourcesSheet = defineAsyncComponent(() => import('../components/ResourcesSheet.vue'))
const MicSheet = defineAsyncComponent(() => import('../components/MicSheet.vue'))
const TempSheet = defineAsyncComponent(() => import('../components/TempSheet.vue'))
const LightSheet = defineAsyncComponent(() => import('../components/LightSheet.vue'))
const ServerPanel = defineAsyncComponent(() => import('../components/ServerPanel.vue'))

const { connected, load: loadCamera } = useCamera()
const {
  logout, mustChangePassword,
  isAuthenticated, isPersistentSession, sessionRemainingSeconds,
} = useAuth()
const { t } = useLocale()
const { preferredProtocol, setProtocol } = useStreamProtocol()
const { unreadCount } = useNotifications()
const { toast, hideToast } = useToast()

// ── Layout state (시안의 계층: 탭 4개 + 오버레이 + 시트 + 모달) ──
const activeTab = ref('home')
const overlay = ref(null) // null | 'notifications' | 'profile' | 'notifSettings'
const schedEdit = ref(null) // null = 닫힘 | { id: number|null, date: string } (id null = 신규)
const recordsDate = ref(null) // 달력 교차 진입 요청 { date } — 매번 새 객체로 전달
const sheet = ref(null) // null | 'mic' | 'temp' | 'light' | 'ptz'
const modal = ref(null) // null | 'camera' | 'prompt' | 'resources' | 'password' | 'server'

// @claude Forced first-login flow (FR-006): the change-password modal opens by
// @claude itself and cannot be dismissed until the password is changed.
watch(mustChangePassword, (forced) => {
  if (forced) modal.value = 'password'
}, { immediate: true })

const modalClosable = computed(() => !(modal.value === 'password' && mustChangePassword.value))

function closeModal() {
  if (!modalClosable.value) return
  modal.value = null
}

function goTab(key) {
  activeTab.value = key
  overlay.value = null
  sheet.value = null
  if (modalClosable.value) modal.value = null
}

// @claude Android 뒤로가기: 위 계층부터 하나씩 닫는다. 강제 비밀번호 변경
// @claude 모달(FR-006)은 소비만 하고 닫지 않는다 — 뒤로가기로 우회 불가.
// @claude HomeTab 풀스크린·ClipPlayerModal은 각자 등록한다(여기선 안 보임).
const offBack = onBackButton(() => {
  if (modal.value) {
    if (modalClosable.value) modal.value = null
    return true
  }
  if (schedEdit.value) { schedEdit.value = null; return true }
  if (sheet.value) { sheet.value = null; return true }
  if (overlay.value) { overlay.value = null; return true }
  if (activeTab.value !== 'home') { activeTab.value = 'home'; return true }
  return false // 홈 탭 루트 → backButton.js가 앱을 최소화
})
onUnmounted(offBack)

// 알림 항목 탭: 이상행동 → 분석, 일정 알람 → 일정 (기록 탭 제거로 분석이 승계)
function onNotifOpen(kind) {
  overlay.value = null
  activeTab.value = kind === 'abn' ? 'ana' : 'cal'
}

function openScheduleEditor({ id = null, date }) {
  schedEdit.value = { id, date }
}

// 분석 탭 진입. 달력에서 날짜와 함께 요청되면 해당 일자로 연다.
function goRecords(date) {
  if (date) recordsDate.value = { date }
  activeTab.value = 'ana'
}

const tabs = [
  { key: 'home', icon: 'house', label: () => t('tab.home') },
  { key: 'cal', icon: 'calendar-blank', label: () => t('tab.schedule') },
  { key: 'ana', icon: 'chart-bar', label: () => t('tab.analysis') },
  { key: 'set', icon: 'gear', label: () => t('tab.settings') },
]
const tabTitle = computed(() => ({
  cal: t('tab.schedule'),
  ana: t('tab.analysis'),
  set: t('tab.settings'),
}[activeTab.value] || ''))

// @claude 비지속 세션의 잔여 시간. 시안 헤더에는 없으나 만료를 모달로만
// @claude 인지하게 되는 회귀를 피하기 위해 유지한다(검토 지적 반영).
const showSessionRemaining = computed(() =>
  isAuthenticated.value && !isPersistentSession.value && sessionRemainingSeconds.value > 0,
)
const sessionRemainingText = computed(() => {
  const total = sessionRemainingSeconds.value
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
})

const modalTitle = computed(() => ({
  camera: t('set.rowCam'),
  prompt: t('set.rowPrompt'),
  analysis: t('set.rowAnalysis'),
  resources: t('set.rowRes'),
  password: t('dashboard.menu.password'),
  server: t('set.rowServer'),
}[modal.value] || ''))

function handleLogout() {
  logout({ redirect: true })
}

onMounted(loadCamera)
</script>

<template>
  <div class="app-frame">

    <!-- ── Top app bar ── -->
    <header class="topbar">
      <span v-if="activeTab === 'home'" class="brand">Mewly</span>
      <span v-else class="topbar-title">{{ tabTitle }}</span>

      <!-- 세션 잔여 시간: 탭과 무관하게 항상 상단 바 중앙 정렬 -->
      <span v-if="showSessionRemaining" class="session-chip">
        <i class="ph ph-clock"></i>{{ sessionRemainingText }}
      </span>

      <span class="topbar-right">
        <!-- 단일 알약 토글: 현재 프로토콜 표시, 탭하면 반대로 전환 -->
        <button
          v-if="activeTab === 'home'"
          class="proto-toggle"
          role="switch"
          :aria-checked="preferredProtocol === 'webrtc'"
          :aria-label="preferredProtocol === 'hls' ? 'WebRTC' : 'HLS'"
          @click="setProtocol(preferredProtocol === 'hls' ? 'webrtc' : 'hls')"
        >{{ preferredProtocol === 'hls' ? 'HLS' : 'WebRTC' }}</button>
        <button class="bell" :aria-label="t('notif.title')" @click="overlay = 'notifications'">
          <i class="ph ph-bell"></i>
          <span v-if="unreadCount" class="bell-badge">{{ unreadCount }}</span>
        </button>
      </span>
    </header>

    <!-- ── Content ── -->
    <!-- @claude KeepAlive: 탭 전환이 스트림 파괴·목록 재조회·필터 초기화를
         일으키지 않도록 탭 컴포넌트를 산 채로 유지한다(검토 지적 반영). -->
    <main class="content" :class="{ padded: activeTab !== 'home' }">
      <KeepAlive>
        <HomeTab
          v-if="activeTab === 'home'"
          @open-sheet="sheet = $event"
          @open-modal="modal = $event"
        />
        <CalendarTab
          v-else-if="activeTab === 'cal'"
          @edit-schedule="openScheduleEditor"
          @go-records="goRecords"
        />
        <AnalysisTab v-else-if="activeTab === 'ana'" :date-request="recordsDate" />
        <SettingsTab
          v-else
          @open-modal="modal = $event"
          @open-overlay="overlay = $event"
          @logout="handleLogout"
        />
      </KeepAlive>
    </main>

    <!-- ── 기기 제어 실패 토스트 (시안: 하단 80px 고정) ── -->
    <Transition name="toast">
      <div v-if="toast" class="device-toast">
        <i class="ph ph-warning-circle toast-icon"></i>
        <span class="toast-text">{{ t(`toast.${toast}`) }}</span>
        <button class="toast-x" @click="hideToast"><i class="ph ph-x"></i></button>
      </div>
    </Transition>

    <!-- ── Bottom navigation ── -->
    <nav class="bottom-nav">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="nav-item"
        :class="{ active: activeTab === tab.key }"
        @click="goTab(tab.key)"
      >
        <i :class="`${activeTab === tab.key ? 'ph-fill' : 'ph'} ph-${tab.icon}`"></i>
        <span>{{ tab.label() }}</span>
      </button>
    </nav>

    <!-- ── Full-screen overlays ── -->
    <!-- @claude <Transition name="layer">: 전환 CSS는 global.css의 Layer transitions
         블록(unscoped)에 있다 — 프레임 루트 클래스 기준이라 어느 레이어든 공통. -->
    <Transition name="layer">
      <NotificationsOverlay
        v-if="overlay === 'notifications'"
        @close="overlay = null"
        @open="onNotifOpen"
      />
      <ProfileOverlay v-else-if="overlay === 'profile'" @close="overlay = null" />
      <NotifSettingsOverlay v-else-if="overlay === 'notifSettings'" @close="overlay = null" />
    </Transition>
    <Transition name="layer">
      <ScheduleEditor
        v-if="schedEdit"
        :schedule-id="schedEdit.id"
        :date="schedEdit.date"
        @close="schedEdit = null"
      />
    </Transition>

    <!-- ── Bottom sheets ── -->
    <Transition name="layer">
      <MicSheet v-if="sheet === 'mic'" @close="sheet = null" />
      <TempSheet v-else-if="sheet === 'temp'" @close="sheet = null" />
      <LightSheet v-else-if="sheet === 'light'" @close="sheet = null" />
      <PtzSheet v-else-if="sheet === 'ptz'" :active="connected" @close="sheet = null" />
    </Transition>

    <!-- ── Centered modals ── -->
    <Transition name="layer">
      <ModalFrame v-if="modal === 'camera'" :title="modalTitle" @close="closeModal">
        <CameraPanel @close="modal = null" />
      </ModalFrame>
      <PromptSheet v-else-if="modal === 'prompt'" @close="modal = null" />
      <AnalysisPanel v-else-if="modal === 'analysis'" @close="modal = null" />
      <ResourcesSheet v-else-if="modal === 'resources'" @close="modal = null" />
      <ModalFrame
        v-else-if="modal === 'password'"
        :title="modalTitle"
        :closable="modalClosable"
        :show-x="false"
        @close="closeModal"
      >
        <ChangePasswordPanel :forced="mustChangePassword" @close="modal = null" />
      </ModalFrame>
      <ModalFrame v-else-if="modal === 'server'" :title="modalTitle" @close="closeModal">
        <ServerPanel @close="modal = null" />
      </ModalFrame>
    </Transition>
  </div>
</template>

<style scoped>
.app-frame {
  position: relative;
  height: 100vh; /* dvh 미지원 폴백 */
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-body);
}

/* — 기기 제어 실패 토스트 — */
.device-toast {
  position: absolute;
  left: 50%;
  bottom: calc(24px + var(--inset-bottom, env(safe-area-inset-bottom, 0px)));
  transform: translateX(-50%);
  width: calc(100% - 32px);
  max-width: 420px;
  z-index: 170;
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 13px 14px;
  border-radius: 12px;
  background: var(--color-neutral-800);
  box-shadow: var(--shadow-lg);
}
.toast-icon {
  flex: none;
  margin-top: 1px;
  font-size: 16px;
  color: var(--color-accent-300);
}
.toast-text {
  flex: 1;
  font-size: var(--font-body);
  line-height: 1.5;
  color: var(--color-text);
}
.toast-x {
  flex: none;
  width: 24px; height: 24px;
  border: none;
  background: none;
  color: var(--color-neutral-400);
  font-size: var(--font-body);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* — top app bar (시안: 58px, 홈=아바타+브랜드, 그 외=탭 제목) — */
.topbar {
  position: relative;
  /* 엣지 투 엣지: 인셋은 네이티브가 --inset-*으로 주입 (웹은 env 폴백).
     주의: padding 축약형이 상단 인셋을 덮어쓰지 않도록 한 선언으로 합친다. */
  height: calc(58px + var(--inset-top, env(safe-area-inset-top, 0px)));
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--inset-top, env(safe-area-inset-top, 0px)) 10px 0 16px;
  border-bottom: 1px solid var(--color-divider);
}
.brand {
  font-family: var(--font-brand);
  font-size: 22px;
  color: var(--color-accent);
}
.topbar-title {
  font-size: var(--font-heading);
  font-weight: 700;
}
.topbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.session-chip {
  position: absolute;
  left: 50%;
  /* 내용 영역(인셋 아래 58px)의 세로 중앙 */
  top: calc(var(--inset-top, env(safe-area-inset-top, 0px)) + 29px);
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: var(--font-label);
  color: var(--color-neutral-400);
  background: var(--color-neutral-900);
  border-radius: 100px;
  padding: 6px 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.session-chip i { font-size: 13.5px; }
.proto-toggle {
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-accent-700);
  background: var(--color-accent-900);
  color: var(--color-accent);
  font-size: var(--font-label);
  font-weight: 800;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.proto-toggle:active { background: var(--color-neutral-900); }
.bell {
  position: relative;
  width: 44px; height: 44px;
  border: none;
  background: none;
  color: var(--color-neutral-300);
  font-size: 19px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.bell:active { background: var(--color-neutral-900); border-radius: 100px; }
.bell-badge {
  position: absolute;
  top: 6px; right: 6px;
  min-width: 16px; height: 16px;
  border-radius: 8px;
  background: var(--color-accent);
  color: var(--color-bg);
  font-size: 10px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

/* — content — */
.content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
/* 일정·기록·설정 탭: 상단 바 아래 여백 (홈은 영상이 바로 붙는다) */
.content.padded { padding-top: 12px; }

/* — bottom navigation (시안: 64px, 4열, 활성=accent·fill·800) — */
.bottom-nav {
  flex: none;
  /* border-box이므로 인셋 패딩만큼 높이도 늘려 내용 64px를 보존한다 */
  height: calc(64px + var(--inset-bottom, env(safe-area-inset-bottom, 0px)));
  border-top: 1px solid var(--color-divider);
  display: grid;
  /* 탭 수가 바뀌어도 CSS 수정이 없도록 균등 자동 분할 */
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  background: var(--color-bg);
  padding-bottom: var(--inset-bottom, env(safe-area-inset-bottom, 0px));
}
.nav-item {
  border: none;
  background: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: var(--color-neutral-500);
  font-family: inherit;
}
.nav-item i { font-size: 20px; }
.nav-item span { font-size: var(--font-caption); }
.nav-item.active {
  color: var(--color-accent);
}
.nav-item.active span { font-weight: 800; }
</style>
