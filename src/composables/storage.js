import { ref, watch } from 'vue'

// @claude 신규 기능(일정·프로필·알림·기기 제어)은 babycat 미지원이라 형태만
// @claude 구현한다. 데이터는 localStorage에 지속하고, 인터페이스가 도출되면
// @claude 각 composable 내부만 교체한다. 키는 mewly. 접두어를 쓴다.
export function persistentRef(key, defaultValue) {
  const storageKey = `mewly.${key}`
  let initial = defaultValue
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (raw !== null) initial = JSON.parse(raw)
  } catch { /* 손상된 저장값은 기본값으로 대체 */ }

  const value = ref(initial)
  watch(value, (next) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next))
    } catch { /* 저장 실패(용량 등)는 무시 — 메모리 상태로 계속 동작 */ }
  }, { deep: true })
  return value
}
