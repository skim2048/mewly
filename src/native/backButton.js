// @claude Android 하드웨어 뒤로가기 — 레이어 핸들러 레지스트리.
// @claude 모든 UI 계층(시트·모달·오버레이·풀스크린·클립 플레이어)이 라우트가
// @claude 아닌 컴포넌트 상태라서, 나중에 등록된 핸들러(=더 위 계층)부터 역순으로
// @claude 물어보고 아무도 소비하지 않으면 앱을 백그라운드로 보낸다(Android 12 표준).
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

const stack = []

// handler: () => boolean — true를 반환하면 뒤로가기를 소비한 것.
// 반환값은 해제 함수. onUnmounted/onDeactivated에서 반드시 호출할 것.
export function onBackButton(handler) {
  stack.push(handler)
  return () => {
    const i = stack.indexOf(handler)
    if (i >= 0) stack.splice(i, 1)
  }
}

if (Capacitor.isNativePlatform()) {
  App.addListener('backButton', () => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i]()) return
    }
    // 루트(홈 탭 또는 로그인 화면): 종료 대신 최소화 — 재진입 시 상태 유지
    App.minimizeApp()
  })
}
