<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useLocale, formatDateTime } from '../composables/useLocale.js'
import { useSchedules, titleLabel, optionLabel, ALARM_OPTIONS, REPEAT_OPTIONS, REPEAT_NONE } from '../composables/useSchedules.js'
import { toIsoDate, parseIsoDate } from '../composables/dates.js'

const emit = defineEmits(['edit-schedule', 'go-records'])

const { t, locale } = useLocale()
const { schedulesOn, daysWithSchedules } = useSchedules()

function toIso(year, month, day) {
  return toIsoDate(new Date(year, month, day))
}

// @claude 오늘·현재 시각은 탭을 열어 둔 채 시간이 흘러도 맞아야 하므로
// @claude 주기적으로 갱신한다(자정 통과 시 오늘 원·교차 진입 가드,
// @claude 시각 경과 시 다음 일정 강조가 이 값을 따른다).
function clockNow() {
  const d = new Date()
  return {
    todayIso: toIsoDate(d),
    nowTime: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  }
}
const clock = ref(clockNow())
const clockTimer = setInterval(() => { clock.value = clockNow() }, 30000)
onBeforeUnmount(() => clearInterval(clockTimer))

const initial = clockNow()
const cursor = ref({ year: new Date().getFullYear(), month: new Date().getMonth() })
const selected = ref(initial.todayIso)

function moveMonth(delta) {
  const d = new Date(cursor.value.year, cursor.value.month + delta, 1)
  cursor.value = { year: d.getFullYear(), month: d.getMonth() }
}

const monthLabel = computed(() =>
  formatDateTime(new Date(cursor.value.year, cursor.value.month, 1), { year: 'numeric', month: 'long' }),
)

const weekdays = computed(() => (locale.value === 'ko'
  ? ['일', '월', '화', '수', '목', '금', '토']
  : ['S', 'M', 'T', 'W', 'T', 'F', 'S']))

// 42셀: 앞뒤 인접 월을 흐리게 채운다 (시안 방식)
const cells = computed(() => {
  const { year, month } = cursor.value
  const first = new Date(year, month, 1)
  const dotDays = daysWithSchedules(year, month)
  const list = []
  const lead = first.getDay()
  const prevLast = new Date(year, month, 0).getDate()
  for (let i = lead - 1; i >= 0; i--) list.push({ n: prevLast - i, dim: true })
  const last = new Date(year, month + 1, 0).getDate()
  for (let n = 1; n <= last; n++) {
    const iso = toIso(year, month, n)
    list.push({ n, iso, today: iso === clock.value.todayIso, selected: iso === selected.value, dot: dotDays.has(n) })
  }
  let trail = 1
  while (list.length % 7 !== 0 || list.length < 42) list.push({ n: trail++, dim: true })
  return list
})

const selectedLabel = computed(() =>
  formatDateTime(parseIsoDate(selected.value), { month: 'long', day: 'numeric', weekday: locale.value === 'ko' ? 'long' : 'short' }),
)

// 기록 교차 진입은 과거·오늘만 (미래의 기록은 존재하지 않음)
const canCross = computed(() => selected.value <= clock.value.todayIso)

const daySchedules = computed(() => {
  const items = schedulesOn(selected.value)
  // 오늘의 다음 일정(현재 시각 이후 첫 항목)을 강조한다 (시안 방식)
  const nextId = selected.value === clock.value.todayIso
    ? items.find((e) => !e.allDay && !e.done && e.time >= clock.value.nowTime)?.id
    : null
  return items.map((e) => ({
    ...e,
    next: e.id === nextId,
    timeLabel: e.allDay ? t('sched.allDayShort') : e.time,
    title: titleLabel(e.title, locale.value),
    meta: e.done
      ? t('sched.done')
      : e.repeat && e.repeat !== REPEAT_NONE
        ? `${optionLabel(REPEAT_OPTIONS, e.repeat, locale.value)} · ${t('sched.alarmWord')} ${optionLabel(ALARM_OPTIONS, e.alarm, locale.value)}`
        : e.allDay ? '' : `${t('sched.alarmWord')} ${optionLabel(ALARM_OPTIONS, e.alarm, locale.value)}`,
  }))
})
</script>

<template>
  <div class="calendar-tab">

    <div class="month-nav">
      <button class="month-btn" @click="moveMonth(-1)"><i class="ph ph-caret-left"></i></button>
      <span class="month-label">{{ monthLabel }}</span>
      <button class="month-btn" @click="moveMonth(1)"><i class="ph ph-caret-right"></i></button>
    </div>

    <div class="weekday-row">
      <span v-for="(w, i) in weekdays" :key="i">{{ w }}</span>
    </div>

    <div class="cal-grid">
      <button
        v-for="(c, i) in cells"
        :key="i"
        class="cal-cell"
        :disabled="c.dim"
        @click="selected = c.iso"
      >
        <span class="cal-dot" :class="{ on: c.dot }"></span>
        <span
          class="cal-num"
          :class="{ dim: c.dim, today: c.today, picked: c.selected && !c.today }"
        >{{ c.n }}</span>
      </button>
    </div>

    <div class="day-list">
      <div class="day-head">
        <span class="day-label">{{ selectedLabel }}</span>
        <button v-if="canCross" class="day-records" @click="emit('go-records', selected)">
          {{ t('sched.dayRecords') }}
        </button>
      </div>

      <button
        v-for="e in daySchedules"
        :key="e.id"
        class="sched-item"
        :class="{ done: e.done }"
        @click="emit('edit-schedule', { id: e.id, date: selected })"
      >
        <span class="sched-time" :class="{ next: e.next }">{{ e.timeLabel }}</span>
        <span class="sched-title">{{ e.title }}</span>
        <span class="sched-meta">{{ e.meta }}</span>
      </button>

      <button class="sched-add" @click="emit('edit-schedule', { id: null, date: selected })">
        {{ t('sched.add') }}
      </button>
    </div>

  </div>
</template>

<style scoped>
.calendar-tab {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.month-nav {
  flex: none;
  margin: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.month-btn {
  width: 40px; height: 40px;
  border-radius: 10px;
  border: none;
  background: var(--color-neutral-900);
  color: var(--color-neutral-400);
  font-size: 15px;
  cursor: pointer;
}
.month-label {
  font-size: var(--font-title);
  font-weight: 700;
}

.weekday-row {
  flex: none;
  margin: 12px 16px 0;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  font-size: var(--font-caption);
  color: var(--color-neutral-400);
  text-align: center;
}

.cal-grid {
  flex: none;
  margin: 4px 16px 0;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  row-gap: 2px;
}
.cal-cell {
  height: 44px;
  border: none;
  background: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-family: inherit;
  padding: 0;
}
.cal-cell:disabled { cursor: default; }
.cal-num {
  width: 30px; height: 30px;
  border-radius: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-body);
  color: var(--color-text);
  box-sizing: border-box;
}
.cal-num.dim { color: var(--color-neutral-700); }
.cal-num.today {
  background: var(--color-accent);
  color: var(--color-bg);
  font-weight: 800;
}
.cal-num.picked {
  border: 1.5px solid var(--color-accent);
  font-weight: 800;
}
.cal-dot {
  width: 5px; height: 5px;
  border-radius: 3px;
  background: transparent;
}
.cal-dot.on { background: var(--color-neutral-400); }

.day-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin: 10px 16px 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding-bottom: 10px;
}
.day-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 0;
}
.day-label {
  font-size: var(--font-body);
  font-weight: 700;
  white-space: nowrap;
}
.day-records {
  border: none;
  background: none;
  color: var(--color-accent);
  font-size: var(--font-label);
  cursor: pointer;
  font-family: inherit;
  padding: 4px;
  white-space: nowrap;
}

.sched-item {
  flex: none;
  display: flex;
  gap: 11px;
  align-items: center;
  padding: 13px;
  border-radius: 10px;
  border: none;
  background: var(--color-neutral-900);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}
.sched-item.done { opacity: 0.55; }
.sched-time {
  flex: none;
  width: 48px;
  font-size: var(--font-label);
  color: var(--color-neutral-400);
}
.sched-time.next {
  color: var(--color-accent);
  font-weight: 800;
}
.sched-title {
  flex: 1;
  font-size: var(--font-body);
  color: var(--color-text);
}
.sched-meta {
  flex: none;
  font-size: var(--font-caption);
  color: var(--color-neutral-400);
  white-space: nowrap;
}
.sched-add {
  flex: none;
  height: 46px;
  border-radius: 10px;
  border: 1px dashed var(--color-neutral-700);
  background: none;
  color: var(--color-neutral-500);
  font-size: var(--font-body);
  cursor: pointer;
  font-family: inherit;
}
</style>
