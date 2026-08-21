import { authFetch } from './useFetch.js'
import { API_ENDPOINTS } from '../endpoints.js'
import { STATE_LABELS, readPresetEpochDate } from './analysisConfig.js'
import { toIsoDate, parseIsoDate } from './dates.js'

// @claude 분석 탭 상태 점유율의 데이터 계층 — babycat /summary(3층) 소비.
// @claude 버킷은 서버가 0 포함으로 채워 주므로 빈 버킷 보정이 없고, 정규화는
// @claude 클라이언트 몫이다(회신서 §7.1). 점유율의 분모는 "라벨이 붙은 표본"
// @claude 이다 — 야간 자유 서술은 무라벨이 일상적으로 발생하므로(§7.4) 무라벨은
// @claude 부재의 신호가 아니라 부재·미추출 혼합의 참고 지표로만 다룬다.

async function fetchSummary(dateFrom, dateTo, bucket) {
  const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, bucket })
  const res = await authFetch(`${API_ENDPOINTS.summary}?${params}`)
  if (!res.ok) throw new Error(`summary ${res.status}`)
  return (await res.json()).buckets || []
}

// @claude 한 추론이 여러 라벨에 매치될 수 있어 Σcounts는 근사 분모다 —
// @claude 상태 간 상대 분포 목적에는 충분하다(회신서 §6 응답 구조 전제).
function labeledSum(counts) {
  return STATE_LABELS.reduce((a, l) => a + (counts[l] ?? 0), 0)
}

function sharesOf(counts) {
  const denom = labeledSum(counts)
  return Object.fromEntries(
    STATE_LABELS.map((l) => [l, denom ? (counts[l] ?? 0) / denom : 0]),
  )
}

// 지정 일자의 시간대·라벨 집계.
// 반환: { total, labeled, hours: [{ total, counts }×24], shares: {label: 비율}, unlabeled: 비율 }
export async function fetchDayStates(dateIso) {
  const buckets = await fetchSummary(dateIso, dateIso, 'hour')

  const hours = Array.from({ length: 24 }, () => ({
    total: 0,
    counts: Object.fromEntries(STATE_LABELS.map((l) => [l, 0])),
  }))
  let total = 0
  const dayCounts = Object.fromEntries(STATE_LABELS.map((l) => [l, 0]))

  for (const b of buckets) {
    const parsed = new Date(b.bucket_start)
    if (Number.isNaN(parsed.getTime())) continue
    const hour = hours[parsed.getHours()]
    hour.total += b.total ?? 0
    total += b.total ?? 0
    for (const label of STATE_LABELS) {
      const n = b.counts?.[label] ?? 0
      hour.counts[label] += n
      dayCounts[label] += n
    }
  }

  const labeled = labeledSum(dayCounts)
  return {
    total,
    labeled,
    hours,
    shares: sharesOf(dayCounts),
    unlabeled: total ? Math.max(0, (total - labeled) / total) : 0,
  }
}

// ── 기준선: 직전 N일의 라벨별 일 점유율 평균·표준편차 (bucket=day 1회 질의) ──
// @claude 프리셋 구성 변경일(presetEpoch) 이전의 날은 비교 가능성이 없으므로
// @claude 수집 범위에서 제외한다(회신서 §7.5).
export async function fetchBaseline(dateIso, days = 14) {
  const base = parseIsoDate(dateIso)
  let from = toIsoDate(base, -days)
  const to = toIsoDate(base, -1)
  const epoch = readPresetEpochDate()
  if (epoch && epoch > from) from = epoch

  const empty = { days: 0, mean: {}, sd: {} }
  if (from > to) return empty
  let buckets
  try {
    buckets = await fetchSummary(from, to, 'day')
  } catch {
    return empty
  }

  const samples = buckets
    .filter((b) => labeledSum(b.counts || {}) > 0)
    .map((b) => sharesOf(b.counts))

  const mean = {}
  const sd = {}
  for (const label of STATE_LABELS) {
    const xs = samples.map((s) => s[label])
    const m = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
    mean[label] = m
    sd[label] = xs.length
      ? Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length)
      : 0
  }
  return { days: samples.length, mean, sd }
}

// ── 리듬 판정 (v1 사양 — 시각화 검토 후 조정 예정) ──
// 기준선 7일 미만이면 판정하지 않고, 편차 문턱은 max(10%p, 2σ)로 한다.
export const BASELINE_MIN_DAYS = 7

export function judgeRhythm(shares, baseline) {
  if (!baseline || baseline.days < BASELINE_MIN_DAYS) return null
  const deviations = []
  for (const label of STATE_LABELS) {
    const threshold = Math.max(0.10, 2 * baseline.sd[label])
    const delta = (shares[label] ?? 0) - baseline.mean[label]
    if (Math.abs(delta) > threshold) {
      deviations.push({ label, direction: delta > 0 ? 'high' : 'low' })
    }
  }
  return deviations
}
