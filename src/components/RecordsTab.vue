<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useClips } from '../composables/useClips.js'
import { useAuth } from '../composables/useAuth.js'
import { authFetch } from '../composables/useFetch.js'
import { API_ENDPOINTS, getClipUrl } from '../endpoints.js'
import { useLocale } from '../composables/useLocale.js'
import { toIsoDate, withDayHeaders } from '../composables/dates.js'
import ClipPlayerModal from './ClipPlayerModal.vue'

// @claude dateRequest: 달력 「이날의 기록 보기」의 교차 진입. 매번 새 객체
// @claude {date}로 전달되어 같은 날짜를 연달아 요청해도 watch가 발화한다.
const props = defineProps({
  dateRequest: { type: Object, default: null },
})

const { clipVersion, deleteClips } = useClips()
const { isAuthenticated, accessToken } = useAuth()
const { t } = useLocale()

// ── Filter (시안: 검색 + 기간 칩 일·주·월·분기·연도) ──
const searchQuery = ref('')
const period = ref('week') // '' = 전체 기간 (활성 칩 재탭으로 해제)
const dateFilter = ref(null) // 달력 교차 진입 시의 단일 날짜 필터

const PERIODS = [
  { key: 'day', label: () => t('rec.period.day') },
  { key: 'week', label: () => t('rec.period.week') },
  { key: 'month', label: () => t('rec.period.month') },
  { key: 'quarter', label: () => t('rec.period.quarter') },
  { key: 'year', label: () => t('rec.period.year') },
]

// @claude 활성 칩을 다시 누르면 해제되어 전체 기간이 된다 — 기간 칩만으로는
// @claude 지난해 이전 클립에 접근할 수 없으므로 전체 기간 진입로를 남긴다.
function pickPeriod(key) {
  dateFilter.value = null
  period.value = period.value === key ? '' : key
}

// 기간 칩 → 서버 질의 범위. 시안의 상대 구간(오늘 기준)을 따른다.
function periodRange(key) {
  const now = new Date()
  switch (key) {
    case 'day': return [toIsoDate(), toIsoDate()]
    case 'week': return [toIsoDate(now, -6), toIsoDate()]
    case 'month': return [toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), toIsoDate()]
    case 'quarter': return [toIsoDate(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), toIsoDate()]
    case 'year': return [toIsoDate(new Date(now.getFullYear(), 0, 1)), toIsoDate()]
    default: return ['', '']
  }
}

// ── Selection ──
const selectMode = ref(false)
const selected = ref(new Set())
const selectedCount = computed(() => selected.value.size)

function enterSelectMode() {
  selectMode.value = true
  selected.value = new Set()
}
function exitSelectMode() {
  selectMode.value = false
  selected.value = new Set()
}
function toggleSelected(name) {
  const next = new Set(selected.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  selected.value = next
}
const allSelected = computed(() =>
  clips.value.length > 0 && clips.value.every((c) => selected.value.has(c.name)),
)
function toggleSelectAll() {
  selected.value = allSelected.value ? new Set() : new Set(clips.value.map((c) => c.name))
}
async function deleteSelected() {
  if (!selected.value.size) return
  await deleteClips([...selected.value])
  selected.value = new Set()
  selectMode.value = false
}

// ── Playback ──
const playing = ref(null)
const playerSrc = computed(() =>
  playing.value ? getClipUrl(playing.value, 'full', accessToken.value || '') : '',
)

function onRowClick(clip) {
  if (selectMode.value) toggleSelected(clip.name)
  else playing.value = clip.name
}

// ── Server data (q · date_from · date_to · limit · offset) ──
const PAGE_SIZE = 25
const currentPage = ref(1)
const clips = ref([])
const total = ref(0)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

// @claude 응답 순서 보장: 필터 전환 중 늦게 도착한 이전 질의의 응답이 현재
// @claude 목록을 덮어쓰지 않도록, 최신 요청 번호가 아닌 응답은 폐기한다.
let fetchSeq = 0

async function fetchClips() {
  if (!isAuthenticated.value) return
  const mySeq = ++fetchSeq
  const params = new URLSearchParams()
  if (searchQuery.value) params.set('q', searchQuery.value)
  const [from, to] = dateFilter.value
    ? [dateFilter.value, dateFilter.value]
    : periodRange(period.value)
  if (from) params.set('date_from', from)
  if (to) params.set('date_to', to)
  params.set('limit', String(PAGE_SIZE))
  params.set('offset', String((currentPage.value - 1) * PAGE_SIZE))
  try {
    const res = await authFetch(`${API_ENDPOINTS.clips}?${params}`)
    if (mySeq !== fetchSeq || !res.ok) return
    const data = await res.json()
    if (mySeq !== fetchSeq) return
    clips.value = data.clips || []
    total.value = data.total ?? 0
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value
      return
    }
    const names = new Set(clips.value.map((c) => c.name))
    selected.value = new Set([...selected.value].filter((n) => names.has(n)))
  } catch {}
}

let fetchScheduled = false
function scheduleFetch(resetPage = false) {
  if (resetPage) {
    currentPage.value = 1
    selected.value = new Set()
  }
  if (fetchScheduled) return
  fetchScheduled = true
  nextTick(() => {
    fetchScheduled = false
    fetchClips()
  })
}

watch(clipVersion, () => scheduleFetch(false), { immediate: true })
let searchTimer = null
watch(searchQuery, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => scheduleFetch(true), 300)
})
watch([period, dateFilter], () => scheduleFetch(true))
watch(currentPage, () => scheduleFetch(false))
watch(() => props.dateRequest, (req) => {
  if (req?.date) dateFilter.value = req.date
}, { immediate: true })

onBeforeUnmount(() => {
  clearTimeout(searchTimer)
  fetchSeq++ // 진행 중 응답 폐기
})

// ── Presentation (시안: 날짜 헤더로 그룹, 행 = 섬네일 + 시각 + 문장) ──
function clipDay(clip) {
  const parsed = new Date(clip.created_at)
  return Number.isNaN(parsed.getTime()) ? '' : toIsoDate(parsed)
}

const rows = computed(() => {
  const enriched = clips.value.map((clip) => {
    const parsed = new Date(clip.created_at)
    const time = Number.isNaN(parsed.getTime())
      ? ''
      : `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`
    return {
      ...clip,
      day: clipDay(clip),
      time,
      text: clip.keywords?.length ? clip.keywords.join(', ') : clip.name,
      picked: selected.value.has(clip.name),
    }
  })
  return withDayHeaders(enriched, (r) => r.day, (day, { isToday, isYesterday }) => {
    const short = day.slice(2)
    if (isToday) return `${t('clips.preset.today')} · ${short}`
    if (isYesterday) return `${t('clips.preset.yesterday')} · ${short}`
    return short
  })
})

function thumbUrl(clip) {
  return getClipUrl(clip.name, 'full', accessToken.value || '')
}
</script>

<template>
  <div class="records-tab">

    <div class="rec-search" :class="{ dim: selectMode }">
      <i class="ph ph-magnifying-glass"></i>
      <input v-model="searchQuery" :placeholder="t('rec.searchPh')" :disabled="selectMode">
    </div>

    <div class="rec-controls">
      <!-- 달력 교차 진입 시: 단일 날짜 칩 (해제하면 기간 칩으로 복귀) -->
      <button
        v-if="dateFilter"
        class="date-chip"
        :class="{ dim: selectMode }"
        :disabled="selectMode"
        @click="dateFilter = null"
      >{{ dateFilter.slice(2) }}<i class="ph ph-x"></i></button>
      <span v-else class="period-pill" :class="{ dim: selectMode }">
        <button
          v-for="p in PERIODS"
          :key="p.key"
          class="period-opt"
          :class="{ on: period === p.key }"
          :disabled="selectMode"
          @click="pickPeriod(p.key)"
        >{{ p.label() }}</button>
      </span>
      <template v-if="!selectMode">
        <button class="ctl-pill right" @click="enterSelectMode">{{ t('rec.select') }}</button>
      </template>
      <template v-else>
        <button class="ctl-pill right accent" @click="toggleSelectAll">
          {{ allSelected ? t('rec.deselectAll') : t('rec.selectAll') }}
        </button>
        <button class="ctl-pill" @click="exitSelectMode">{{ t('common.cancel') }}</button>
      </template>
    </div>

    <div class="rec-list">
      <span v-if="!rows.length" class="rec-empty">
        {{ searchQuery ? t('rec.noMatch', { q: searchQuery }) : t('rec.empty') }}
      </span>
      <template v-for="r in rows" :key="r.name">
        <span v-if="r.header" class="rec-day">{{ r.header }}</span>
        <div class="rec-row" @click="onRowClick(r)">
          <span v-if="selectMode" class="rec-check" :class="{ on: r.picked }">
            <i v-if="r.picked" class="ph-bold ph-check"></i>
          </span>
          <span class="rec-thumb">
            <video :src="thumbUrl(r)" preload="metadata" muted></video>
            <i class="ph-fill ph-play"></i>
          </span>
          <span class="rec-copy">
            <span class="rec-time">{{ r.time }}</span>
            <span class="rec-text">{{ r.text }}</span>
          </span>
        </div>
      </template>

      <div v-if="totalPages > 1" class="rec-pager">
        <button class="pager-btn" :disabled="currentPage <= 1" @click="currentPage--">
          <i class="ph ph-caret-left"></i>
        </button>
        <span class="pager-count">{{ currentPage }} / {{ totalPages }}</span>
        <button class="pager-btn" :disabled="currentPage >= totalPages" @click="currentPage++">
          <i class="ph ph-caret-right"></i>
        </button>
      </div>
    </div>

    <div v-if="selectMode" class="sel-bar">
      <span class="sel-count">{{ t('rec.selected', { count: selectedCount }) }}</span>
      <button class="sel-delete" :class="{ armed: selectedCount }" :disabled="!selectedCount" @click="deleteSelected">
        {{ t('common.delete') }}
      </button>
    </div>

    <ClipPlayerModal :open="!!playing" :src="playerSrc" @close="playing = null" />
  </div>
</template>

<style scoped>
.records-tab {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.rec-search {
  flex: none;
  margin: 0 16px;
  height: 44px;
  border-radius: 100px;
  background: var(--color-neutral-900);
  display: flex;
  align-items: center;
  padding: 0 15px;
  gap: 8px;
}
.rec-search.dim { opacity: 0.45; }
.rec-search i {
  color: var(--color-neutral-500);
  font-size: 15px;
}
.rec-search input {
  flex: 1;
  border: none;
  background: none;
  color: var(--color-text);
  font-size: 13px;
  font-family: inherit;
  outline: none;
}

.rec-controls {
  flex: none;
  margin: 10px 16px 0;
  display: flex;
  gap: 8px;
  align-items: center;
}
.period-pill {
  height: 36px;
  padding: 0 3px;
  border-radius: 100px;
  background: var(--color-neutral-900);
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
.period-pill.dim { opacity: 0.45; }
.date-chip {
  height: 36px;
  padding: 0 14px;
  border-radius: 100px;
  border: 1px solid var(--color-accent-700);
  background: var(--color-accent-900);
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.date-chip i { font-size: 12px; }
.date-chip.dim { opacity: 0.45; }
.period-opt {
  height: 30px;
  padding: 0 12px;
  border-radius: 100px;
  border: none;
  background: none;
  color: var(--color-neutral-400);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}
.period-opt.on {
  background: var(--color-accent-900);
  color: var(--color-text);
  font-weight: 700;
}
.ctl-pill {
  height: 36px;
  padding: 0 14px;
  border-radius: 100px;
  border: none;
  background: var(--color-neutral-900);
  color: var(--color-neutral-400);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}
.ctl-pill.right { margin-left: auto; }
.ctl-pill.accent { color: var(--color-accent); }

.rec-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin: 12px 16px 0;
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding-bottom: 10px;
}
.rec-empty {
  padding: 36px 0;
  text-align: center;
  font-size: 12.8px;
  color: var(--color-neutral-500);
}
.rec-day {
  flex: none;
  font-size: 11px;
  color: var(--color-neutral-500);
  margin-top: 2px;
}
.rec-row {
  flex: none;
  display: flex;
  gap: 10px;
  align-items: center;
  cursor: pointer;
}
.rec-check {
  flex: none;
  width: 20px; height: 20px;
  border-radius: 5px;
  border: 1.5px solid var(--color-neutral-600);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
.rec-check.on {
  border: 1px solid var(--color-accent);
  background: var(--color-accent);
}
.rec-check i {
  font-size: 12px;
  color: var(--color-bg);
}
.rec-thumb {
  position: relative;
  flex: none;
  width: 84px; height: 56px;
  border-radius: 8px;
  background: var(--color-neutral-800);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.rec-thumb video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}
.rec-thumb i {
  position: relative;
  font-size: 15px;
  color: rgba(233, 233, 237, 0.85);
  text-shadow: 0 0 6px rgba(0, 0, 0, 0.6);
}
.rec-copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.rec-time {
  font-size: 11px;
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
}
.rec-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-neutral-300);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.rec-pager {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 6px 0;
}
.pager-btn {
  width: 36px; height: 36px;
  border-radius: 100px;
  border: none;
  background: var(--color-neutral-900);
  color: var(--color-neutral-400);
  font-size: 14px;
  cursor: pointer;
}
.pager-btn:disabled { opacity: 0.4; cursor: default; }
.pager-count {
  font-size: 12px;
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
}

.sel-bar {
  flex: none;
  padding: 10px 16px;
  border-top: 1px solid var(--color-divider);
  display: flex;
  align-items: center;
  gap: 10px;
}
.sel-count {
  flex: 1;
  font-size: 12.8px;
  color: var(--color-neutral-400);
}
.sel-delete {
  height: 40px;
  padding: 0 18px;
  border-radius: 10px;
  border: none;
  background: var(--color-neutral-900);
  color: var(--color-neutral-600);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}
.sel-delete.armed {
  background: var(--danger-bg);
  color: var(--danger);
}
</style>
