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

// @claude 야간 완성형 프롬프트는 폐기(회신서 §7.4): 인형 실측에서 피사체와
// @claude 무관하게 lying을 내는 편향이 확정되어, 주야간 모두 자유 서술을 쓴다.
export const DAY_PROMPT = 'Describe the scene.'

// 주간 구간 초기값 (사용자 확정: 09–18시, 경계는 휴리스틱 탐색 대상)
export const DEFAULT_DAY_START = '09:00'
export const DEFAULT_DAY_END = '18:00'

// @claude 프롬프트가 주야간 동일해진 뒤에도 프리셋 2구간을 유지하는 이유:
// @claude (1) 추론 이력의 preset 태그로 주야(IR) 구간이 데이터에 남고,
// @claude (2) 야간 전용 문안을 재실험할 자리가 보존된다. 야간은 prompt를
// @claude 생략하여 기본 프롬프트(/prompt)로 폴백시킨다(백엔드 규약).
// @claude 경계는 정각으로 제한한다(회신서 §7.5 — 1시간 버킷과 정렬).
export function buildPresetsPayload(dayStart, dayEnd) {
  return {
    labels: LABEL_GROUPS,
    presets: [
      { id: 'day', start: dayStart, end: dayEnd, prompt: DAY_PROMPT },
      { id: 'night', start: dayEnd, end: dayStart },
    ],
  }
}

// ── 기준선 단절 기록 (회신서 §7.5) ──
// @claude 경계·프롬프트·어휘 중 무엇이든 바뀌면 과거 기준선과의 비교 가능성이
// @claude 깨진다. 주입 페이로드 전체의 서명으로 변경을 감지하여 적용 일자를
// @claude 기록하고, 기준선 수집 범위를 그 이후로 한정한다(기기 로컬 한계는
// @claude 서버가 변경 이력을 제공하지 않는 현 구조에서의 절충).
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
