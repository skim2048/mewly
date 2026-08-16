import { ref } from 'vue'
import { persistentRef } from './storage.js'

// @claude 알림 설정 — 일정 알람(sched)과 이상행동 알림(abn)의 공용 스위치.
// @claude 실제 알림 전달(LocalNotifications)은 백엔드 인터페이스 확정과 함께
// @claude 구현하므로, 여기서는 스위치 상태만 보관한다.
const settings = persistentRef('notifSettings', { sched: true, abn: true })

// @claude 시스템 알림 권한. 플러그인 도입 전이라 실제 조회가 불가능하므로
// @claude 항상 허용으로 둔다(시안의 거부 상태 UI는 이 값으로 분기).
const permissionGranted = ref(true)

export function useNotifSettings() {
  function toggle(key) {
    settings.value = { ...settings.value, [key]: !settings.value[key] }
  }
  return { settings, permissionGranted, toggle }
}
