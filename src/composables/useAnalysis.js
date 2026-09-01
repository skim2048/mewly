import { computed, ref } from 'vue'
import { useSSE } from './useSSE.js'
import { authFetch, failureDetail } from './useFetch.js'
import { APP_ENDPOINTS } from '../endpoints.js'

// @claude FR-024/FR-025: saving prompt settings never starts analysis; the
// @claude explicit start fans out to the analyzer and the recorder.
const busy = ref(false)
// @claude 시작 실패 사유. 스트리밍 비활성(로컬 판정·FR-050 409)은 'no_stream',
// @claude 네트워크 실패는 'network', 그 외는 백엔드 detail 원문. 표시할 토스트는
// @claude startErrorToast()가 결정한다 — 실패가 무반응으로 보이지 않게 한다
// @claude (2026-08-26 502 결함, 2026-08-28 오버레이 대체 지시).
const startError = ref('')

export function useAnalysis() {
  const { state } = useSSE()

  // @claude idle means the pipeline waits for an explicit start (FR-024), so a
  // @claude streaming pipeline that is not idle is an analysis in progress.
  const analysisActive = computed(() => state.streaming_active && state.pipeline_state !== 'idle')

  async function start() {
    startError.value = ''
    try {
      const res = await authFetch(APP_ENDPOINTS.analysisStart, { method: 'POST' })
      if (res.ok) return true
      if (res.status === 409) startError.value = 'no_stream'
      else startError.value = await failureDetail(res, `HTTP ${res.status}`)
      return false
    } catch {
      startError.value = 'network'
      return false
    }
  }

  // @claude FR-051: stop analysis and buffering while streaming stays up.
  async function stop() {
    try {
      const res = await authFetch(APP_ENDPOINTS.analysisStop, { method: 'POST' })
      const data = await res.json()
      return res.ok && data.ok
    } catch {
      return false
    }
  }

  // @claude Returns false on failure; the reason is in startError (see
  // @claude startErrorToast). 스트리밍 비활성은 요청 없이 로컬에서 판정한다.
  async function toggle() {
    if (busy.value) return true
    if (!analysisActive.value && !state.streaming_active) {
      startError.value = 'no_stream'
      return false
    }
    busy.value = true
    try {
      if (analysisActive.value) {
        await stop()
        return true
      }
      return await start()
    } finally {
      busy.value = false
    }
  }

  // @claude 시작 실패 사유를 토스트 종류로 대응시킨다(회신서 analysis-start-502.md
  // @claude §6.4). router의 detail은 세 값 중 하나이며, 두 컴포넌트가 함께 실패하면
  // @claude "analyzer, recorder"로 온다. 알 수 없는 사유는 원문을 그대로 보인다.
  function startErrorToast() {
    const detail = startError.value
    if (!detail) return null
    if (detail === 'no_stream') return { kind: 'anaStart.noStream' }
    if (detail === 'network') return { kind: 'anaStart.network' }
    if (detail === 'cannot verify streaming state') return { kind: 'anaStart.streaming' }
    const m = detail.match(/^start not accepted by:\s*(.+)$/)
    if (m) {
      const names = m[1].split(',').map((n) => n.trim())
      const known = names.filter((n) => n === 'analyzer' || n === 'recorder')
      if (known.length === names.length) {
        return { kind: known.length > 1 ? 'anaStart.both' : `anaStart.${known[0]}` }
      }
    }
    return { kind: 'analysisStartFail', params: { detail } }
  }

  return { analysisActive, busy, startError, startErrorToast, toggle, start }
}
