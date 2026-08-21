import { ref } from 'vue'
import ui from '../../config/ui.json'

// @claude 기기 제어 실패 토스트(시안: timeout·refused·busy). 조명·온도·마이크가
// @claude 목업인 동안은 발화 지점이 없으며, 실기기 연동 시 명령 실패 처리에서
// @claude showToast를 호출한다.
const toast = ref(null) // null | 'timeout' | 'refused' | 'busy' | 'patrolLock' | 'loadFail'
let hideTimer = null
const AUTO_HIDE_MS = ui.toastAutoHideMs

export function useToast() {
  function showToast(kind) {
    toast.value = kind
    clearTimeout(hideTimer)
    hideTimer = setTimeout(() => { toast.value = null }, AUTO_HIDE_MS)
  }
  function hideToast() {
    toast.value = null
  }
  return { toast, showToast, hideToast }
}
