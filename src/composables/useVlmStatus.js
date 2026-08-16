import { computed } from 'vue'
import { useSSE } from './useSSE.js'
import { useAnalysis } from './useAnalysis.js'
import { t } from './useLocale.js'

// @claude 시안의 상태 분류: wait(준비·전환 계열) · idle(대기) · on(구동) · err(오류).
const VLM_KINDS = {
  initializing: 'wait',
  downloading: 'wait',
  compiling: 'wait',
  loading: 'wait',
  switching: 'wait',
  ready: 'idle',
  running: 'on',
  error: 'err',
}

// @claude 시안의 VLM 점 색: wait #d9a13b · idle neutral-500 · on accent · err #e07a86.
const VLM_DOTS = {
  wait: '#d9a13b',
  idle: 'var(--color-neutral-500)',
  on: 'var(--color-accent)',
  err: '#e07a86',
}

export function useVlmStatus() {
  const { state } = useSSE()
  const { analysisActive } = useAnalysis()

  const vlmKind = computed(() => {
    // @claude 시안: VLM이 대기 상태이고 분석이 도는 동안은 「구동 중」으로 분류.
    if (state.vlm_state === 'ready' && analysisActive.value) return 'on'
    return VLM_KINDS[state.vlm_state] || 'idle'
  })
  const vlmDot = computed(() => VLM_DOTS[vlmKind.value])
  const vlmLabel = computed(() => {
    if (vlmKind.value === 'on') return t('dashboard.vlm.running')
    return t(`dashboard.vlm.${state.vlm_state}`)
  })

  return { vlmDot, vlmLabel, vlmKind }
}
