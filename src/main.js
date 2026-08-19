import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import './assets/global.css'
import './assets/controls.css'
// 앱 시작 시점에 테마를 적용한다 — 로그인 화면도 같은 테마로 시작해야 한다.
import './composables/useTheme.js'
// Android 하드웨어 뒤로가기 리스너 등록 (네이티브에서만 동작)
import './native/backButton.js'
import { hideSplashWhenReady } from './native/init.js'

createApp(App).use(router).mount('#app')

// 스플래시는 아이콘 폰트 준비 후 걷는다 — 콜드스타트 빈 아이콘 박스 방지
hideSplashWhenReady()
