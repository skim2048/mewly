// @claude 네이티브(Android) 통합 초기화 — 상태바·스플래시·햅틱.
// @claude 웹(브라우저)에서도 임포트되므로 모든 네이티브 호출은 isNative 가드 +
// @claude catch로 감싼다(플러그인 미탑재 웹뷰·구형 API에서 조용히 무시).
import { Capacitor, registerPlugin } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

// 커스텀 미니 플러그인 — android/.../NavigationBarPlugin.java (하단 내비바 색 동기화)
const NavigationBar = registerPlugin('NavigationBar')

export const isNative = Capacitor.isNativePlatform()

// 브랜드 배경색 — global.css의 --color-bg와 반드시 일치해야 한다.
const BG = { dark: '#181513', light: '#f5f0e9' }

// @claude useTheme의 watch(theme)에서 호출된다. 상태바 색·아이콘 톤과
// @claude theme-color 메타를 앱 테마에 동기화한다.
export async function applyNativeTheme(theme) {
  const bg = BG[theme] || BG.dark
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
  if (!isNative) return
  try {
    // Style.Light = 밝은 배경(어두운 아이콘), Style.Dark = 어두운 배경(밝은 아이콘)
    await StatusBar.setStyle({ style: theme === 'light' ? Style.Light : Style.Dark })
    await StatusBar.setBackgroundColor({ color: bg })
  } catch {
    // API 35 edge-to-edge에서는 setBackgroundColor가 no-op — 무시
  }
  try {
    // 3버튼 내비 사용 시 하단 바도 테마를 따르게 한다 (제스처 내비는 투명이라 무관)
    await NavigationBar.setColor({ color: bg, darkIcons: theme === 'light' })
  } catch {
    // 플러그인 미등록·edge-to-edge no-op — 무시
  }
}

// @claude 스플래시는 launchAutoHide: false(capacitor.config.json)로 잡아두고,
// @claude 아이콘 웹폰트가 준비된 뒤 걷는다 — 콜드스타트의 빈 아이콘 박스 방지.
export async function hideSplashWhenReady() {
  await Promise.race([
    document.fonts.ready,
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ])
  if (!isNative) return
  try {
    // 페이드 시간은 capacitor.config.json의 launchFadeOutDuration이 담당한다
    await SplashScreen.hide()
  } catch { /* no-op */ }
}

// @claude 영상 전체화면 진입/이탈 (HomeTab·ClipPlayerModal). 상태바만 숨기면
// @claude 내비바(스와이프 바) 영역이 남아 좌측 띠로 보이므로(실기 지적) 양쪽
// @claude 시스템 바를 함께 숨기는 몰입 모드로 처리한다.
export async function setStatusBarHidden(hidden) {
  if (!isNative) return
  try {
    if (hidden) await StatusBar.hide()
    else await StatusBar.show()
  } catch { /* no-op */ }
  try {
    await NavigationBar.setBarsHidden({ hidden })
  } catch { /* 플러그인 미등록 등 — 무시 */ }
}

// ── 햅틱 — 탭 전환·토글·PTZ/Mic 패드에만 사용한다(과용 금지) ──
export async function tapLight() {
  if (!isNative) return
  try {
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch { /* no-op */ }
}
