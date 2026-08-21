import { authFetch } from './useFetch.js'
import analysis from '../../config/analysis.json'
import { API_ENDPOINTS } from '../endpoints.js'

// @claude 분석 탭의 데이터 이음새(2안 방침). 현재 구현은 recorder 이벤트
// @claude 이력(/events)의 클라이언트 집계이며, babycat에 추론 이력·집계
// @claude API(/summary)가 신설되면 이 파일 내부만 교체한다.
// @claude 한계(계획서에 명시): 트리거 매치 이벤트만 반영되고, 클립 자동
// @claude 정리(FR-033) 시 대응 이벤트도 삭제되어 과거 요약이 함께 소실된다.

const DAY_LIMIT = analysis.eventsDayLimit // 하루 조회 상한 — 초과분은 절단되므로 total과 대조 가능

// 지정 일자의 이벤트를 키워드별 24시간 빈도로 집계한다.
// 반환: { total, cards: [{ keyword, total, bins[24], clipsByHour[24][] }] }
export async function fetchDaySummary(dateIso) {
  const params = new URLSearchParams({
    date_from: dateIso,
    date_to: dateIso,
    limit: String(DAY_LIMIT),
  })
  const res = await authFetch(`${API_ENDPOINTS.eventHistory}?${params}`)
  if (!res.ok) throw new Error(`events ${res.status}`)
  const data = await res.json()

  const byKeyword = new Map()
  for (const ev of data.events || []) {
    const parsed = new Date(ev.created_at)
    if (Number.isNaN(parsed.getTime())) continue
    const hour = parsed.getHours()
    // @claude trigger는 매치된 키워드들의 쉼표 결합 문자열이다("sitting,looking").
    // @claude 결합 단위가 아니라 키워드 단위로 분해해 각 카드에 귀속시킨다 —
    // @claude 동시 매치 이벤트는 해당 키워드 카드 모두에 1회씩 계상된다.
    for (const keyword of ev.trigger.split(',').map((k) => k.trim()).filter(Boolean)) {
      let card = byKeyword.get(keyword)
      if (!card) {
        card = {
          keyword,
          total: 0,
          bins: Array(24).fill(0),
          clipsByHour: Array.from({ length: 24 }, () => []),
        }
        byKeyword.set(keyword, card)
      }
      card.total += 1
      card.bins[hour] += 1
      if (ev.clip_name) card.clipsByHour[hour].push(ev.clip_name)
    }
  }

  const cards = [...byKeyword.values()].sort((a, b) => b.total - a.total)
  return { total: data.total ?? cards.reduce((a, c) => a + c.total, 0), cards }
}
