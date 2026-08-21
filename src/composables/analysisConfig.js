import { persistentRef } from './storage.js'

// @claude 2층(구조화 출력) 클라이언트 어휘 — babycat 실험 회신(analysis-reply.md)과
// @claude 사용자 확정에 따른 값. babycat은 이 어휘를 불투명한 태그로만 취급하며,
// @claude 부분 문자열 매치를 수행하므로 동의어는 5자 이상의 완전형만 넣는다
// @claude (lie→believe, rest→interesting, sit→situation 오매치 방지).
export const STATE_LABELS = ['lying', 'sitting', 'standing']

export const LABEL_GROUPS = {
  lying: ['lying', 'laying', 'sleeping', 'asleep', 'resting', 'curled'],
  sitting: ['sitting', 'seated'],
  standing: ['standing', 'stands', 'upright'],
}

// @claude 프롬프트는 주야간 공통 단일(회신서 §7.4.1 확정: 야간 완성형은 lying
// @claude 편향으로 기각, 자유 서술이 유일한 판별 형식). 기본 프롬프트(/prompt)를
// @claude 그대로 쓰므로 프리셋 구간을 주입하지 않는다(presets: []) — 백엔드의
// @claude 구간 기능 자체는 향후 조정 수단으로 남는다.
export function buildLabelsPayload() {
  return { labels: LABEL_GROUPS, presets: [] }
}

// ── 야간 해석 경계 (클라이언트 로컬 설정) ──
// @claude 프리셋 구간이 사라지면서 주간/야간 구분은 백엔드 주입이 아니라 mewly의
// @claude 해석 파라미터가 되었다. 야간 IR에서는 앉음↔서기 혼동으로 자세 3종
// @claude 세분의 신뢰도가 낮아(§7.4.1) 누움/비누움 2단계로 해석하며, 이 경계가
// @claude 그 구분선이다. 초기값 09–18시(사용자 확정, 휴리스틱 탐색 대상).
// @claude 경계 변경은 해석 방식만 바꾸므로 기준선 단절(epoch) 대상이 아니다.
export const dayRange = persistentRef('anaDayRange', { start: 9, end: 18 })

// start >= end이면 자정을 넘는 주간 구간으로 해석한다 (백엔드 프리셋과 같은 규약)
export function isDayHour(hour, range = dayRange.value) {
  const { start, end } = range
  if (start === end) return true // 방어값 — UI가 동일 시각을 막는다
  return start < end ? hour >= start && hour < end : hour >= start || hour < end
}

// ── 기준선 단절 기록 (회신서 §7.5·§7.6) ──
// @claude 어휘·프롬프트 구성이 바뀌면 과거 기준선과의 비교 가능성이 깨진다.
// @claude 주입 페이로드 전체의 서명으로 변경을 감지하여 적용 일자를 기록하고,
// @claude 기준선 수집 범위를 그 이후로 한정한다(기기 로컬 한계는 서버가 변경
// @claude 이력을 제공하지 않는 현 구조에서의 절충).
const EPOCH_KEY = 'mewly.presetEpoch'

function signature(payload) {
  const text = JSON.stringify(payload)
  let hash = 5381
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0
  return String(hash)
}

export function markPresetApplied(payload, dateIso) {
  try {
    const sig = signature(payload)
    const prev = JSON.parse(window.localStorage.getItem(EPOCH_KEY))
    if (prev?.sig === sig) return // 동일 구성 재적용은 단절이 아니다
    window.localStorage.setItem(EPOCH_KEY, JSON.stringify({ sig, date: dateIso }))
  } catch { /* 기록 실패 시 기준선 한정만 잃는다 — 무시 */ }
}

export function readPresetEpochDate() {
  try {
    return JSON.parse(window.localStorage.getItem(EPOCH_KEY))?.date ?? null
  } catch {
    return null
  }
}
