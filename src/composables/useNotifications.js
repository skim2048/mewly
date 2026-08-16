import { computed } from 'vue'
import { persistentRef } from './storage.js'

// @claude 알림함. 실서비스에서는 이상행동(SSE 사건)과 일정 알람이 항목을
// @claude 추가하지만, 백엔드 인터페이스 도출 전이므로 시드 데이터로 형태만
// @claude 시연한다. kind: 'abn'(이상행동) | 'sched'(일정 알람).

function seedAt(dayOffset, time) {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${time}:00`
}

const SEED = [
  { id: 1, kind: 'abn', at: seedAt(0, '14:38'), text: '개가 짖고 있다.', read: false },
  { id: 2, kind: 'sched', at: seedAt(0, '14:50'), text: '15:00 관절 영양제 — 10분 전 알람', read: false },
  { id: 3, kind: 'abn', at: seedAt(0, '11:05'), text: '개가 사료 그릇 옆에 서 있다.', read: true },
  { id: 4, kind: 'abn', at: seedAt(-1, '21:40'), text: '개가 방문 앞을 긁고 있다.', read: true },
]

const store = persistentRef('notifications', { nextId: SEED.length + 1, items: SEED })

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
