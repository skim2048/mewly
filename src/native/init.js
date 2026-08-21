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

// @claude 엣지 투 엣지(실기 지적으로 전환): 시스템 바는 투명이고 그 뒤를 웹
// @claude 레이어가 칠하므로, 여기서는 아이콘 톤만 테마에 맞춘다. 바 영역의
// @claude 안전 여백은 getInsets가 CSS 변수(--inset-top/--inset-bottom)로 전달한다.
export async function applyNativeTheme(theme) {
  const bg = BG[theme] || BG.dark
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
  if (!isNative) return
  try {
    await StatusBar.setOverlaysWebView({ overlay: true })
    // Style.Light = 밝은 배경(어두운 아이콘), Style.Dark = 어두운 배경(밝은 아이콘)
    await StatusBar.setStyle({ style: theme === 'light' ? Style.Light : Style.Dark })
  } catch { /* no-op */ }
  try {
    await NavigationBar.setColor({ color: '#00000000', darkIcons: theme === 'light' })
  } catch { /* 플러그인 미등록 — 무시 */ }
  syncInsets()
}

// @claude Android WebView는 env(safe-area-inset-*)를 채우지 않으므로, 네이티브
// @claude 인셋을 CSS 변수로 주입한다. CSS는 var(--inset-*, env(...)) 폴백 사슬로
// @claude 웹(브라우저)에서도 동작한다.
export async function syncInsets() {
  if (!isNative) return
  try {
    const { top, bottom } = await NavigationBar.getInsets()
    const root = document.documentElement.style
    root.setProperty('--inset-top', `${top || 0}px`)
    root.setProperty('--inset-bottom', `${bottom || 0}px`)
  } catch { /* no-op */ }
}

if (isNative) {
  // 회전·바 표시 변화로 인셋이 바뀌는 경우를 따라간다
  window.addEventListener('resize', () => syncInsets())
}

// @claude 아이콘 웹폰트는 @font-face 선언만으로는 내려받아지지 않고, 해당
// @claude 패밀리의 글리프를 그리는 요소가 나타나야 요청된다. 첫 화면인 로그인에는
// @claude 아이콘이 없으므로 여기서 로드를 명시적으로 개시한다(이 역할 때문에
// @claude index.html에는 아이콘 폰트 preload를 두지 않는다). document.fonts.ready는
// @claude 아직 시작되지 않은 로드를 기다리지 않으므로, 이 개시가 있어야 아래
// @claude 스플래시 대기가 실제로 아이콘 폰트를 포함한다. 두 style.css 모두
// @claude unicode-range가 없으므로 기본 탐색 문자열로도 폰트 전체가 매치된다.
const ICON_FONTS = ['1em Phosphor', '1em Phosphor-Fill']

function loadIconFonts() {
  try {
    return Promise.all(ICON_FONTS.map((font) => document.fonts.load(font)))
      .catch(() => {})
  } catch {
    return Promise.resolve()
  }
}

// @claude 스플래시는 launchAutoHide: false(capacitor.config.json)로 잡아두고,
// @claude 아이콘 웹폰트가 준비된 뒤 걷는다 — 콜드스타트의 빈 아이콘 박스 방지.
export async function hideSplashWhenReady() {
  await Promise.race([
    loadIconFonts().then(() => document.fonts.ready),
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
  if (!hidden) syncInsets()
}

// ── 햅틱 — 탭 전환·토글·PTZ/Mic 패드에만 사용한다(과용 금지) ──
export async function tapLight() {
  if (!isNative) return
  try {
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch { /* no-op */ }
}
