import { persistentRef } from './storage.js'
import { parseIsoDate, toIsoDate } from './dates.js'

// @claude 일정은 명시된 날짜(단일 또는 date~endDate 범위)에만 나타난다.
// @claude 반복(repeat)은 알람 예약 규칙을 뜻하는 메타데이터로, 달력 투영은
// @claude 알람 실동작(LocalNotifications)과 함께 백엔드 인터페이스 확정 후 구현한다.

export const CATEGORIES = [
  { ko: '목욕', en: 'Bath' },
  { ko: '미용', en: 'Grooming' },
  { ko: '심장 사상충', en: 'Heartworm' },
  { ko: '예방 접종', en: 'Vaccination' },
  { ko: '병원', en: 'Vet' },
]
export const CATEGORY_CUSTOM = { ko: '직접 입력', en: 'Custom' }

export const ALARM_OPTIONS = [
  { v: '정각', en: 'On time' },
  { v: '5분 전', en: '5 min before' },
  { v: '10분 전', en: '10 min before' },
  { v: '15분 전', en: '15 min before' },
  { v: '30분 전', en: '30 min before' },
  { v: '1시간 전', en: '1 hr before' },
  { v: '2시간 전', en: '2 hrs before' },
  { v: '12시간 전', en: '12 hrs before' },
  { v: '1일 전', en: '1 day before' },
  { v: '2일 전', en: '2 days before' },
]

export const REPEAT_OPTIONS = [
  { v: '안 함', en: 'None' },
  { v: '매일', en: 'Daily' },
  { v: '매주', en: 'Weekly' },
  { v: '매월', en: 'Monthly' },
  { v: '매년', en: 'Yearly' },
]

export const REPEAT_NONE = '안 함'

export function optionLabel(options, value, locale) {
  if (locale !== 'en') return value
  return options.find((o) => (o.v ?? o.ko) === value)?.en ?? value
}

export function titleLabel(title, locale) {
  if (locale !== 'en') return title
  return CATEGORIES.find((c) => c.ko === title)?.en ?? title
}

const store = persistentRef('schedules', { nextId: 8, items: [] })

// @claude 초기 시연용 더미(id 1~7)를 저장소에서 1회 정리한다(사용자 확정).
// @claude 사용자 생성 항목은 nextId가 8부터 시작해 id 충돌이 없다.
try {
  const PURGE_KEY = 'mewly.schedules.seedPurged'
  if (!window.localStorage.getItem(PURGE_KEY)) {
    store.value = { ...store.value, items: store.value.items.filter((i) => i.id > 7) }
    window.localStorage.setItem(PURGE_KEY, '1')
  }
} catch { /* 저장 불가 환경 — 무시 */ }

function occursOn(item, iso) {
  const from = item.date
  const to = item.endDate || item.date
  return from <= iso && iso <= to
}

export function useSchedules() {
  function schedulesOn(iso) {
    return store.value.items
      .filter((item) => occursOn(item, iso))
      .sort((a, b) => ((a.allDay ? '' : a.time) < (b.allDay ? '' : b.time) ? -1 : 1))
  }

  // @claude 날짜 문자열은 반드시 로컬 기준으로 해석하고(parseIsoDate),
  // @claude 순회는 대상 월과의 교집합으로 한정한다.
  function daysWithSchedules(year, month) {
    const monthStart = new Date(year, month, 1)
    const monthEnd = new Date(year, month + 1, 0)
    const days = new Set()
    for (const item of store.value.items) {
      const from = parseIsoDate(item.date)
      const to = parseIsoDate(item.endDate || item.date)
      const start = from > monthStart ? from : monthStart
      const end = to < monthEnd ? to : monthEnd
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days.add(d.getDate())
      }
    }
    return days
  }

  function addSchedule(data) {
    const id = store.value.nextId
    store.value = {
      nextId: id + 1,
      items: [...store.value.items, { id, ...data }],
    }
    return id
  }

  function updateSchedule(id, data) {
    store.value = {
      ...store.value,
      items: store.value.items.map((item) => (item.id === id ? { ...item, ...data } : item)),
    }
  }

  function removeSchedule(id) {
    store.value = {
      ...store.value,
      items: store.value.items.filter((item) => item.id !== id),
    }
  }

  function getSchedule(id) {
    return store.value.items.find((item) => item.id === id) || null
  }

  return { schedulesOn, daysWithSchedules, addSchedule, updateSchedule, removeSchedule, getSchedule }
}
