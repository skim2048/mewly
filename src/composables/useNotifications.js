import { computed } from 'vue'
import { persistentRef } from './storage.js'

// @claude 알림함. 실서비스에서는 이상행동(SSE 사건)과 일정 알람이 항목을
// @claude 추가하지만, 백엔드 인터페이스 도출 전이므로 시드 데이터로 형태만
// @claude 시연한다. kind: 'abn'(이상행동) | 'sched'(일정 알람).

const store = persistentRef('notifications', { nextId: 5, items: [] })

// @claude 초기 시연용 더미(id 1~4)를 저장소에서 1회 정리한다(사용자 확정).
try {
  const PURGE_KEY = 'mewly.notifications.seedPurged'
  if (!window.localStorage.getItem(PURGE_KEY)) {
    store.value = { ...store.value, items: store.value.items.filter((n) => n.id > 4) }
    window.localStorage.setItem(PURGE_KEY, '1')
  }
} catch { /* 저장 불가 환경 — 무시 */ }

export function useNotifications() {
  const notifications = computed(() =>
    [...store.value.items].sort((a, b) => (a.at < b.at ? 1 : -1)),
  )
  const unreadCount = computed(() => store.value.items.filter((n) => !n.read).length)

  function markRead(id) {
    store.value = {
      ...store.value,
      items: store.value.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }
  }

  function remove(id) {
    store.value = {
      ...store.value,
      items: store.value.items.filter((n) => n.id !== id),
    }
  }

  function clearAll() {
    store.value = { ...store.value, items: [] }
  }

  return { notifications, unreadCount, markRead, remove, clearAll }
}
