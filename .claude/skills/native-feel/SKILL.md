---
name: native-feel
description: Mewly의 네이티브 필 규칙 — Vue 컴포넌트를 추가/수정할 때 웹뷰 티가 다시 생기지 않도록 지켜야 할 체크리스트. 새 화면·시트·모달·오버레이·버튼·입력·스크롤 영역을 만들거나 고칠 때 반드시 참조한다.
---

# Mewly 네이티브 필 규칙

이 프로젝트는 Capacitor로 감싼 Android 앱이다. 2026-08 "네이티브 필 패스"에서
웹뷰 티를 제거했고, 아래 규칙을 어기면 그 티가 되살아난다. 새 코드를 쓰기 전에
해당 항목을 확인하라. 전역 인프라(이미 되어 있는 것)를 새로 만들지 말고 재사용하라.

## 전역 인프라 (재사용할 것 — 재구현 금지)

| 것 | 위치 |
|---|---|
| 탭 하이라이트·user-select·overscroll·터치 지연 제거 | `src/assets/global.css` "Native app feel" 블록 |
| 버튼 공통 프레스 피드백 (`button:active` 디밍) | global.css 같은 블록 |
| 레이어 전환 CSS (시트 슬라이드업·모달 스케일·오버레이 슬라이드) | global.css "Layer transitions" 블록 |
| 상태바·스플래시·햅틱 헬퍼 | `src/native/init.js` |
| 하단 내비바 색 동기화 (커스텀 플러그인) | `android/.../java/app/mewly/client/NavigationBarPlugin.java` + `MainActivity.java` 등록, 호출은 init.js의 `applyNativeTheme` |
| Android 뒤로가기 레지스트리 | `src/native/backButton.js` (`onBackButton`) |
| select 닫힌 상태 테마 | `src/assets/controls.css` 끝의 `select` 블록 |

## 새 레이어(시트/모달/오버레이)를 추가할 때

1. **프레임 재사용**: `SheetFrame` / `ModalFrame` / `OverlayFrame`을 쓴다. 루트가
   `.sheet-backdrop` / `.modal-backdrop` / `.overlay-shell`이어야 전환 CSS가 작동한다.
2. **전환 래퍼**: MainView.vue에서 `<Transition name="layer">`로 감싼 v-if 클러스터
   안에 넣는다. 래퍼 밖에 두면 팝인/팝아웃한다.
3. **뒤로가기**: MainView의 레이어 상태(`sheet`/`modal`/`overlay`/`schedEdit`)를 쓰면
   기존 핸들러가 자동으로 닫아준다. MainView가 볼 수 없는 상태(컴포넌트 내부 모달,
   풀스크린 등)라면 `onBackButton()`을 직접 등록하고 **반드시 해제 함수를
   onUnmounted/onDeactivated에서 호출**한다. 닫으면 `true`를 반환해 소비를 알린다.
   참고 구현: `ClipPlayerModal.vue`, `HomeTab.vue`(풀스크린).
4. 강제 유지 모달(닫기 금지)은 뒤로가기를 **소비하되 닫지 않는다**
   (예: 강제 비밀번호 변경, MainView의 `modalClosable` 참조).

## 새 버튼·탭 가능한 요소

- `<button>`을 쓴다 (div + @click 금지, 백드롭 제외). 전역 `:active` 디밍은 자동.
- `:hover` 스타일은 **반드시** `@media (hover: hover)` 안에 넣는다. 밖에 두면
  Android에서 탭 후 스티키 호버가 남는다.
- 아이콘 전용 버튼에는 `title=` 금지 → `aria-label`을 쓴다.
- 햅틱(`tapLight()`)은 탭 전환·토글·PTZ/Mic 패드 수준의 핵심 조작에만. 일반 버튼에
  붙이지 않는다(과용은 역효과).

## 새 스크롤 영역

- 패턴: `flex: 1; min-height: 0; overflow: auto` (기존 12곳과 동일).
- **새 스크롤 컨테이너의 클래스를 global.css의 `overscroll-behavior: contain`
  목록에 추가한다.** 빠뜨리면 오버스크롤이 페이지로 체이닝된다.

## 새 입력 필드

- 숫자: `inputmode="numeric"`(정수) 또는 `"decimal"`, 포트는 `type="number"`.
- 주소/호스트: `inputmode="url" autocapitalize="off" spellcheck="false"`.
- 모든 텍스트 입력에 `enterkeyhint` (`next`/`go`/`done`/`search`).
- `<select>`는 그대로 써도 된다 — 닫힌 상태 테마는 전역 CSS가 처리하고, 열린
  피커는 네이티브 다이얼로그가 정상이다.

## 치수·색

- 전체 높이는 `100vh` 폴백 + `100dvh` 2줄 패턴. (예외: 회전 풀스크린 rotor의
  `width: 100vh`는 의도된 물리 뷰포트 — dvh로 바꾸지 말 것.)
- 상단 고정 바에는 `env(safe-area-inset-top, 0px)` 패딩 (topbar 참조).
- 브랜드 배경색 `#1e1e20`(다크)/`#f6f6f7`(라이트)을 바꾸면 **4곳을 함께** 바꾼다:
  `global.css` 토큰, `src/native/init.js`의 `BG`, `index.html` theme-color,
  `android/.../values/colors.xml`.

## 애니메이션

- 레이어 전환 CSS는 global.css에 unscoped로 있다 — scoped CSS와 특이도 경합이
  나면 클래스를 두 번 겹쳐 쓴다(예: `.layer-enter-from.sheet-backdrop.sheet-backdrop`).
- 탭 전환에는 애니메이션을 넣지 않는다(즉시 전환이 네이티브 표준).
- 새 keyframes/transition을 추가해도 `prefers-reduced-motion` 블록이 전역으로
  무력화하므로 별도 처리는 불필요하다.

## 네이티브 API 호출

- 모든 Capacitor 플러그인 호출은 `src/native/init.js`의 헬퍼를 거치거나, 최소한
  `isNative` 가드 + try/catch로 감싼다 — 웹(브라우저)에서도 같은 코드가 돈다.
- 플러그인 추가 시 **Capacitor 7 호환 메이저(@^7)로 고정**해 설치한다.
  (최신 태그는 Capacitor 8용이라 ERESOLVE로 깨진다.)
- 플러그인 추가/제거 후에는 `npm run sync`를 돌려야 Android 프로젝트에 반영된다.

## 빌드

```
npm run sync          # vite build && cap sync android — 웹 코드 수정 시 필수
cd android && gradlew assembleDebug
```
APK: `android/app/build/outputs/apk/debug/app-debug.apk`
