import { computed, ref } from 'vue'
import ui from '../../config/ui.json'

// @claude 앱 공용 토스트. 종류(kind)는 i18n 키 toast.{kind}와 1:1이다.
// @claude   기기 제어 실패(시안): timeout · refused · busy — 조명·온도·마이크가
// @claude     목업인 동안은 발화 지점이 없으며, 실기기 연동 시 명령 실패 처리에서 호출한다.
// @claude   PTZ: patrolLock            분석: loadFail
// @claude   프로필: profileSaved · profileSaveFail
// @claude   카메라: camSaved · camOn · camOff
const toast = ref(null) // null | kind
let hideTimer = null
const AUTO_HIDE_MS = ui.toastAutoHideMs

// 완료 안내(체크 아이콘) — 그 외는 모두 경고 아이콘으로 표시한다 (MainView 참조)
const SUCCESS_KINDS = new Set(['profileSaved', 'camSaved', 'camOn', 'camOff'])
const toastIsSuccess = computed(() => SUCCESS_KINDS.has(toast.value))

export function useToast() {
  function showToast(kind) {
    toast.value = kind
    clearTimeout(hideTimer)
    hideTimer = setTimeout(() => { toast.value = null }, AUTO_HIDE_MS)
  }
  function hideToast() {
    toast.value = null
  }
  return { toast, toastIsSuccess, showToast, hideToast }
}
