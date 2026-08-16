<script setup>
import { computed, ref } from 'vue'
import { useLocale } from '../composables/useLocale.js'
import { useNotifications } from '../composables/useNotifications.js'

const emit = defineEmits(['close', 'open'])

const { t } = useLocale()
const { notifications, markRead, remove, clearAll } = useNotifications()

const activeFilter = ref('all')
const filters = [
  { key: 'all', label: () => t('notif.tab.all') },
  { key: 'abn', label: () => t('notif.tab.behavior') },
  { key: 'sched', label: () => t('notif.tab.schedule') },
]

function localDate(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// @claude 시안: 날짜가 바뀌는 지점에만 구분선을 넣되 오늘은 생략하고,
// @claude 어제는 문구로, 그보다 이전은 YY-MM-DD로 표기한다.
const list = computed(() => {
  const today = localDate()
  const yesterday = localDate(-1)
  const filtered = notifications.value.filter(
    (n) => activeFilter.value === 'all' || n.kind === activeFilter.value,
  )
  let prevDay = null
  return filtered.map((n) => {
    const day = n.at.slice(0, 10)
    let header = null
    if (day !== prevDay && day !== today) {
      header = day === yesterday ? t('dashboard.day.yesterday') : day.slice(2)
    }
    prevDay = day
    return { ...n, header, time: n.at.slice(11, 16) }
  })
})

function open(n) {
  markRead(n.id)
  emit('open', n.kind)
}
</script>

<template>
  <div class="notif-overlay">
    <div class="overlay-head">
      <button class="head-btn" @click="emit('close')"><i class="ph ph-arrow-left"></i></button>
      <span class="head-title">{{ t('notif.title') }}</span>
      <button class="head-clear" @click="clearAll">{{ t('notif.clearAll') }}</button>
    </div>

    <div class="filter-seg">
      <button
        v-for="f in filters"
        :key="f.key"
        class="filter-opt"
        :class="{ on: activeFilter === f.key }"
        @click="activeFilter = f.key"
      >{{ f.label() }}</button>
    </div>

    <div class="notif-list">
      <div v-if="!list.length" class="notif-empty">{{ t('notif.none') }}</div>
      <template v-for="n in list" :key="n.id">
        <div v-if="n.header" class="day-rule">
          <span class="rule-line"></span>
          <span>{{ n.header }}</span>
          <span class="rule-line"></span>
        </div>
        <div class="notif-card" :class="{ read: n.read }" @click="open(n)">
          <span class="notif-body">
            <span class="notif-kind" :class="{ unread: !n.read }">
              {{ n.kind === 'abn' ? t('notif.kind.abn') : t('notif.kind.sched') }} · {{ n.time }}
            </span>
            <span class="notif-text">{{ n.text }}</span>
          </span>
          <button class="notif-x" @click.stop="remove(n.id)"><i class="ph ph-x"></i></button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.notif-overlay {
  position: fixed;
  inset: 0;
  z-index: 160;
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
}
.overlay-head {
  flex: none;
  height: 56px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px 0 8px;
}
.head-btn {
  width: 44px; height: 44px;
  border: none;
  background: none;
  color: var(--color-neutral-300);
  font-size: 19px;
  cursor: pointer;
}
.head-title {
  flex: 1;
  font-size: 17px;
  font-weight: 700;
}
.head-clear {
  height: 44px;
  border: none;
  background: none;
  color: var(--color-neutral-400);
  font-size: 12.5px;
  cursor: pointer;
  padding: 0 8px;
  font-family: inherit;
}

.filter-seg {
  flex: none;
  margin: 0 16px;
  height: 40px;
  border-radius: 100px;
  background: var(--color-neutral-900);
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  padding: 3px;
  gap: 3px;
}
.filter-opt {
  border: none;
  border-radius: 100px;
  background: none;
  color: var(--color-neutral-400);
  font-size: 12.8px;
  cursor: pointer;
  font-family: inherit;
}
.filter-opt.on {
  background: var(--color-accent-900);
  color: var(--color-text);
  font-weight: 700;
}

.notif-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.notif-empty {
  padding: 40px 0;
  text-align: center;
  font-size: 13px;
  color: var(--color-neutral-500);
}
.day-rule {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 11.5px;
  color: var(--color-neutral-500);
}
.rule-line {
  flex: 1;
  height: 1px;
  background: var(--color-divider);
}

.notif-card {
  border-radius: 10px;
  background: var(--color-neutral-900);
  padding: 12px 13px;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  border-left: 2px solid var(--color-accent);
  cursor: pointer;
}
.notif-card.read {
  border-left-color: transparent;
  opacity: 0.6;
}
.notif-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.notif-kind {
  font-size: 11.5px;
  color: var(--color-neutral-500);
}
.notif-kind.unread { color: var(--color-accent); }
.notif-text {
  font-size: 13.3px;
  line-height: 1.5;
  color: var(--color-text);
}
.notif-x {
  flex: none;
  width: 30px; height: 30px;
  border-radius: 15px;
  border: none;
  background: var(--color-neutral-800);
  color: var(--color-neutral-500);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
