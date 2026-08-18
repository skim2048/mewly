// 날짜 전용(YYYY-MM-DD) 문자열의 공용 처리.
// @claude new Date('YYYY-MM-DD')는 UTC 자정으로 해석되어 서측 시간대에서
// @claude 하루가 어긋난다. 날짜 키의 생성·해석은 반드시 이 유틸을 거쳐
// @claude 로컬 시간 기준으로 통일한다.

export function toIsoDate(date = new Date(), offsetDays = 0) {
  const d = new Date(date)
  if (offsetDays) d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 로컬 자정 기준 Date로 해석한다.
export function parseIsoDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, m - 1, d)
}

// @claude 시안: 날짜가 바뀌는 지점에만 헤더를 넣는다. 라벨 규칙(오늘 생략
// @claude 여부, 문구)은 화면마다 달라 labelFn으로 위임한다.
// labelFn(day, { isToday, isYesterday }) → string | null
export function withDayHeaders(items, getDay, labelFn) {
  const today = toIsoDate()
  const yesterday = toIsoDate(new Date(), -1)
  let prevDay = null
  return items.map((item) => {
    const day = getDay(item)
    const header = day !== prevDay
      ? labelFn(day, { isToday: day === today, isYesterday: day === yesterday })
      : null
    prevDay = day
    return { ...item, header }
  })
}
