<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useClips } from '../composables/useClips.js'
import { useAuth } from '../composables/useAuth.js'
import { authFetch } from '../composables/useFetch.js'
import { API_ENDPOINTS, getClipUrl } from '../endpoints.js'
import { useLocale } from '../composables/useLocale.js'
import ClipPlayerModal from './ClipPlayerModal.vue'

const { clipVersion, deleteClips } = useClips()
const { isAuthenticated, accessToken } = useAuth()
const { t } = useLocale()

// ── Filter (시안: 검색 + 기간 칩 일·주·월·분기·연도) ──
const searchQuery = ref('')
const period = ref('week')

function localDate(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const PERIODS = [
  { key: 'day', label: () => t('rec.period.day') },
  { key: 'week', label: () => t('rec.period.week') },
  { key: 'month', label: () => t('rec.period.month') },
  { key: 'quarter', label: () => t('rec.period.quarter') },
  { key: 'year', label: () => t('rec.period.year') },
]

// 기간 칩 → 서버 질의 범위. 시안의 상대 구간(오늘 기준)을 따른다.
function periodRange(key) {
  const now = new Date()
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  switch (key) {
    case 'day': return [localDate(), localDate()]
    case 'week': return [localDate(-6), localDate()]
    case 'month': return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), localDate()]
    case 'quarter': return [iso(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), localDate()]
    case 'year': return [iso(new Date(now.getFullYear(), 0, 1)), localDate()]
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

async function fetchClips() {
  if (!isAuthenticated.value) return
  const params = new URLSearchParams()
  if (searchQuery.value) params.set('q', searchQuery.value)
  const [from, to] = periodRange(period.value)
  if (from) params.set('date_from', from)
  if (to) params.set('date_to', to)
  params.set('limit', String(PAGE_SIZE))
  params.set('offset', String((currentPage.value - 1) * PAGE_SIZE))
  try {
    const res = await authFetch(`${API_ENDPOINTS.clips}?${params}`)
    if (!res.ok) return
    const data = await res.json()
    clips.value = data.clips || []
    total.value = data.total ?? 0
    const maxPage = Math.max(1, Math.ceil(total.value / PAGE_SIZE))
    if (currentPage.value > maxPage) {
      currentPage.value = maxPage
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
watch(period, () => scheduleFetch(true))
watch(currentPage, () => scheduleFetch(false))

// ── Presentation (시안: 날짜 헤더로 그룹, 행 = 섬네일 + 시각 + 문장) ──
function clipDay(clip) {
  const parsed = new Date(clip.created_at)
  if (Number.isNaN(parsed.getTime())) return ''
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
}

const rows = computed(() => {
  const today = localDate()
  const yesterday = localDate(-1)
  let prevDay = null
  return clips.value.map((clip) => {
    const day = clipDay(clip)
    let header = null
    if (day !== prevDay) {
      const short = day.slice(2)
      if (day === today) header = `${t('clips.preset.today')} · ${short}`
      else if (day === yesterday) header = `${t('clips.preset.yesterday')} · ${short}`
      else header = short
    }
    prevDay = day
    const parsed = new Date(clip.created_at)
    const time = Number.isNaN(parsed.getTime())
      ? ''
      : `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`
    return {
      ...clip,
      header,
      time,
      text: clip.keywords?.length ? clip.keywords.join(', ') : clip.name,
      picked: selected.value.has(clip.name),
    }
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
      <span class="period-pill" :class="{ dim: selectMode }">
        <button
          v-for="p in PERIODS"
          :key="p.key"
          class="period-opt"
          :class="{ on: period === p.key }"
          :disabled="selectMode"
          @click="period = p.key"
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
