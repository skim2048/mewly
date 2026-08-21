<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useLocale, formatDateTime } from '../composables/useLocale.js'
import { useAuth } from '../composables/useAuth.js'
import { useClips } from '../composables/useClips.js'
import { authFetch } from '../composables/useFetch.js'
import { API_ENDPOINTS, getClipUrl } from '../endpoints.js'
import { parseIsoDate, toIsoDate } from '../composables/dates.js'
import { fetchDaySummary } from '../composables/useEventSummary.js'
import {
  fetchDayStates,
  fetchBaseline,
  judgeRhythm,
  BASELINE_MIN_DAYS,
} from '../composables/useInferenceSummary.js'
import { STATE_LABELS } from '../composables/analysisConfig.js'
import ClipPlayerModal from './ClipPlayerModal.vue'

// @claude 분석 탭 — 기록+분석 병합(사용자 확정): 하루 요약(키워드별 24시간
// @claude 히트맵) 위, 그날의 클립 목록 아래. 히트맵 셀·키워드 탭으로 목록을
// @claude 필터링하는 드릴다운. 클립 관리(검색·선택·삭제)는 기록 탭에 남긴다.
// @claude 데이터는 /events 클라이언트 집계(useEventSummary) — 2안 스케치.
// @claude dateRequest: 달력 「이날의 분석 보기」·알림의 교차 진입(기록 탭에서
// @claude 승계). 매번 새 객체 {date}로 전달되어 같은 날짜도 watch가 발화한다.
const props = defineProps({
  dateRequest: { type: Object, default: null },
})

const { t } = useLocale()
const { isAuthenticated, accessToken } = useAuth()
const { clipVersion, deleteClips } = useClips()

// ── 대상 날짜 (오늘 기준 역방향 이동만 허용) ──
const dayOffset = ref(0)

watch(() => props.dateRequest, (req) => {
  if (!req?.date) return
  const target = parseIsoDate(req.date)
  const today = parseIsoDate(toIsoDate())
  const diff = Math.round((today - target) / 86400000)
  if (diff >= 0) dayOffset.value = diff
}, { immediate: true })
const targetDate = computed(() => {
  const d = new Date()
  d.setDate(d.getDate() - dayOffset.value)
  return d
})
const targetIso = computed(() => toIsoDate(targetDate.value))
const dateLabel = computed(() =>
  formatDateTime(targetDate.value, { month: 'long', day: 'numeric', weekday: 'short' }),
)

// ── 요약 (해당 일 + 지난주 같은 요일 비교치) ──
const summary = ref({ total: 0, cards: [] })
const lastWeekTotals = ref({})
let summarySeq = 0

async function loadSummary() {
  if (!isAuthenticated.value) return
  const mySeq = ++summarySeq
  try {
    const [today, lastWeek] = await Promise.all([
      fetchDaySummary(targetIso.value),
      fetchDaySummary(toIsoDate(targetDate.value, -7)),
    ])
    if (mySeq !== summarySeq) return
    summary.value = today
    lastWeekTotals.value = Object.fromEntries(lastWeek.cards.map((c) => [c.keyword, c.total]))
  } catch {}
}

// 히트맵 셀 강도: 그날 최대치 기준 4단계 양자화(계획 확정 — 희소 데이터 대응)
const cards = computed(() => summary.value.cards.map((c) => {
  const max = Math.max(...c.bins)
  return {
    ...c,
    cells: c.bins.map((v) => (v === 0 ? 0 : Math.max(1, Math.round((v / max) * 4)))),
  }
}))

// 인사이트: 최다 키워드와 지난주 같은 요일 대비 발생 수 병기
const highlight = computed(() => {
  const top = summary.value.cards[0]
  if (!top) return null
  return {
    title: t('ana.hl.top', { kw: top.keyword }),
    sub: t('ana.hl.compare', { n: top.total, m: lastWeekTotals.value[top.keyword] ?? 0 }),
  }
})

// ── 상태 점유율 (3층: /summary 소비) — 리듬 카드·타임라인 ──
const dayStates = ref(null) // null | fetchDayStates 반환값
const baseline = ref(null)
let statesSeq = 0

async function loadStates() {
  if (!isAuthenticated.value) return
  const mySeq = ++statesSeq
  try {
    const st = await fetchDayStates(targetIso.value)
    if (mySeq !== statesSeq) return
    dayStates.value = st
    const bl = await fetchBaseline(targetIso.value)
    if (mySeq !== statesSeq) return
    baseline.value = bl
  } catch {}
}

// 리듬 카드 행: 라벨별 오늘 점유율 + 기준선 평균
const stateRows = computed(() => {
  const st = dayStates.value
  if (!st) return []
  const rows = STATE_LABELS.map((label) => ({
    key: label,
    name: t(`ana.state.${label}`),
    share: st.shares[label] ?? 0,
    mean: baseline.value?.days ? baseline.value.mean[label] : null,
  }))
  // @claude 무라벨은 부재·미추출 혼합의 참고 지표(회신서 §7.4) — 기준선 비교 없음
  rows.push({ key: 'unlabeled', name: t('ana.state.unlabeled'), share: st.unlabeled, mean: null })
  return rows
})

// 판정: null=기준선 부족, []=이상 없음, [{label, direction}]=편차
const rhythm = computed(() => {
  if (!dayStates.value?.total) return null
  return judgeRhythm(dayStates.value.shares, baseline.value)
})

// 타임라인 컬럼: 시간대별 상태 구성비 (스택 세그먼트, 위에서부터 무라벨→서기→앉기→눕기)
const timelineCols = computed(() => {
  const st = dayStates.value
  if (!st) return []
  return st.hours.map((h) => {
    if (!h.total) return { empty: true, segs: [] }
    const segs = STATE_LABELS.map((label) => ({
      key: label,
      pct: (h.counts[label] / h.total) * 100,
    }))
    const matched = segs.reduce((a, s) => a + s.pct, 0)
    return { empty: false, segs, unlabeledPct: Math.max(0, 100 - matched) }
  })
})

// ── 드릴다운 필터: null | { keyword, hour(null=키워드 전체) } ──
const drill = ref(null)

function pickCell(card, hour) {
  if (!card.bins[hour]) return // 빈 셀은 필터 대상 아님
  const same = drill.value?.keyword === card.keyword && drill.value?.hour === hour
  drill.value = same ? null : { keyword: card.keyword, hour }
}
function pickKeyword(card) {
  const same = drill.value?.keyword === card.keyword && drill.value?.hour === null
  drill.value = same ? null : { keyword: card.keyword, hour: null }
}
const drillLabel = computed(() => {
  if (!drill.value) return ''
  const { keyword, hour } = drill.value
  return hour === null
    ? keyword
    : `${keyword} · ${t('ana.hourRange', { from: hour, to: hour + 1 })}`
})

function cellLabel(card, hour) {
  return `${card.keyword} · ${t('ana.hourRange', { from: hour, to: hour + 1 })} · ${t('ana.total', { count: card.bins[hour] })}`
}

// ── 그날의 클립 목록 ──
const clips = ref([])
let clipSeq = 0

async function loadClips() {
  if (!isAuthenticated.value) return
  const mySeq = ++clipSeq
  const params = new URLSearchParams({
    date_from: targetIso.value,
    date_to: targetIso.value,
    limit: '500',
  })
  try {
    const res = await authFetch(`${API_ENDPOINTS.clips}?${params}`)
    if (mySeq !== clipSeq || !res.ok) return
    const data = await res.json()
    if (mySeq !== clipSeq) return
    clips.value = data.clips || []
  } catch {}
}

// 드릴다운 → 이벤트의 clip_name 집합으로 목록을 좁힌다
const allowedClipNames = computed(() => {
  if (!drill.value) return null
  const card = summary.value.cards.find((c) => c.keyword === drill.value.keyword)
  if (!card) return new Set()
  const hours = drill.value.hour === null ? card.clipsByHour : [card.clipsByHour[drill.value.hour]]
  return new Set(hours.flat())
})

const rows = computed(() => {
  const allowed = allowedClipNames.value
  return clips.value
    .filter((clip) => !allowed || allowed.has(clip.name))
    .map((clip) => {
      const parsed = new Date(clip.created_at)
      const time = Number.isNaN(parsed.getTime())
        ? ''
        : `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`
      return {
        ...clip,
        time,
        text: clip.vlm_text || (clip.keywords?.length ? clip.keywords.join(', ') : clip.name),
      }
    })
})

function thumbUrl(clip) {
  // #t=0.1: Android WebView가 실제 첫 프레임을 그리도록 시킹 (기록 탭과 동일)
  return `${getClipUrl(clip.name, 'full', accessToken.value || '')}#t=0.1`
}

// ── 다중 선택 삭제 (기록 탭에서 이식 — 수동 삭제 경로 유지, 사용자 확정) ──
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
  rows.value.length > 0 && rows.value.every((r) => selected.value.has(r.name)),
)
// @claude 전체 선택의 범위는 화면의 목록(드릴다운 필터 적용 후)이다 — 보이지
// @claude 않는 클립을 삭제 대상에 넣지 않는다.
function toggleSelectAll() {
  selected.value = allSelected.value ? new Set() : new Set(rows.value.map((r) => r.name))
}
async function deleteSelected() {
  if (!selected.value.size) return
  await deleteClips([...selected.value])
  exitSelectMode()
}

function onRowClick(row) {
  if (selectMode.value) toggleSelected(row.name)
  else openClip(row)
}

// ── 재생 ──
const playing = ref(null) // null | { name, title, desc }
const playerSrc = computed(() =>
  playing.value ? getClipUrl(playing.value.name, 'full', accessToken.value || '') : '',
)
function openClip(row) {
  playing.value = { name: row.name, title: `${dateLabel.value} ${row.time}`, desc: row.text }
}

// ── 적재: 날짜 이동·클립 변경·로그인 상태에 반응 ──
function reload() {
  drill.value = null
  exitSelectMode()
  loadSummary()
  loadClips()
  loadStates()
}
watch([targetIso, isAuthenticated], reload, { immediate: true })
watch(clipVersion, () => { loadSummary(); loadClips() })

onBeforeUnmount(() => {
  summarySeq++
  clipSeq++
  statesSeq++
})
</script>

<template>
  <div class="analysis-tab">

    <!-- ── 날짜 이동 (일정 탭의 월 이동 어법) ── -->
    <div class="ana-datebar">
      <button class="date-btn" :aria-label="t('ana.prevDay')" @click="dayOffset++">
        <i class="ph ph-caret-left"></i>
      </button>
      <span class="date-label">{{ dateLabel }}</span>
      <button class="date-btn" :disabled="dayOffset === 0" :aria-label="t('ana.nextDay')" @click="dayOffset--">
        <i class="ph ph-caret-right"></i>
      </button>
    </div>

    <div class="ana-body">

      <!-- ── 오늘의 리듬 (상태 점유율 vs 개체 기준선) ── -->
      <div v-if="dayStates" class="ana-card">
        <div class="card-head-static">
          <span class="card-name">{{ t('ana.rhythm.title') }}</span>
          <span v-if="!dayStates.total" class="rhythm-badge">{{ t('ana.rhythm.noData') }}</span>
          <span v-else-if="rhythm === null" class="rhythm-badge">
            {{ t('ana.rhythm.collecting', { n: baseline?.days ?? 0, min: BASELINE_MIN_DAYS }) }}
          </span>
          <span v-else-if="!rhythm.length" class="rhythm-badge ok">{{ t('ana.rhythm.ok') }}</span>
        </div>
        <template v-if="dayStates.total">
          <p v-for="d in rhythm || []" :key="d.label" class="rhythm-dev">
            {{ t(`ana.rhythm.dev.${d.direction}`, { label: t(`ana.state.${d.label}`) }) }}
          </p>
          <div class="state-rows">
            <div v-for="row in stateRows" :key="row.key" class="state-row">
              <span class="state-dot" :class="`sc-${row.key}`"></span>
              <span class="state-name">{{ row.name }}</span>
              <span class="state-share">{{ Math.round(row.share * 100) }}%</span>
              <span v-if="row.mean !== null" class="state-mean">
                {{ t('ana.rhythm.baseline', { m: Math.round(row.mean * 100) }) }}
              </span>
            </div>
          </div>
        </template>
      </div>

      <!-- ── 상태 분포 타임라인 (시간대별 구성비) ── -->
      <div v-if="dayStates?.total" class="ana-card">
        <div class="card-head-static">
          <span class="card-name">{{ t('ana.timeline.title') }}</span>
        </div>
        <div class="tl-strip">
          <span
            v-for="(col, i) in timelineCols"
            :key="i"
            class="tl-col"
            :class="{ empty: col.empty }"
          >
            <template v-if="!col.empty">
              <span class="tl-seg sc-unlabeled" :style="{ height: `${col.unlabeledPct}%` }"></span>
              <span
                v-for="seg in [...col.segs].reverse()"
                :key="seg.key"
                class="tl-seg"
                :class="`sc-${seg.key}`"
                :style="{ height: `${seg.pct}%` }"
              ></span>
            </template>
          </span>
        </div>
        <div class="ruler">
          <span v-for="h in [0, 6, 12, 18, 24]" :key="h">{{ h }}</span>
        </div>
      </div>

      <!-- ── 인사이트 카드 ── -->
      <div v-if="highlight" class="ana-highlight">
        <i class="ph ph-sparkle hl-icon"></i>
        <span class="hl-copy">
          <span class="hl-title">{{ highlight.title }}</span>
          <span class="hl-sub">{{ highlight.sub }}</span>
        </span>
      </div>
      <span v-else class="ana-empty">{{ t('ana.empty') }}</span>

      <!-- ── 키워드별 24시간 히트맵 카드 ── -->
      <div v-for="card in cards" :key="card.keyword" class="ana-card">
        <button
          class="card-head"
          :class="{ on: drill?.keyword === card.keyword && drill?.hour === null }"
          @click="pickKeyword(card)"
        >
          <span class="card-name">{{ card.keyword }}</span>
          <span class="card-total">{{ t('ana.total', { count: card.total }) }}</span>
        </button>
        <div class="strip">
          <button
            v-for="(lv, i) in card.cells"
            :key="i"
            class="cell"
            :class="[`lv${lv}`, { on: drill?.keyword === card.keyword && drill?.hour === i }]"
            :aria-label="cellLabel(card, i)"
            @click="pickCell(card, i)"
          ></button>
        </div>
        <div class="ruler">
          <span v-for="h in [0, 6, 12, 18, 24]" :key="h">{{ h }}</span>
        </div>
      </div>

      <!-- ── 그날의 클립 목록 (드릴다운 대상) ── -->
      <div class="clips-head">
        <span class="clips-title">{{ t('ana.clips') }} <b>{{ rows.length }}</b></span>
        <button v-if="drill && !selectMode" class="drill-chip" @click="drill = null">
          {{ drillLabel }}<i class="ph ph-x"></i>
        </button>
        <button v-if="!selectMode" class="sel-pill" :disabled="!rows.length" @click="enterSelectMode">
          {{ t('ana.sel.select') }}
        </button>
        <template v-else>
          <button class="sel-pill accent" @click="toggleSelectAll">
            {{ allSelected ? t('ana.sel.none') : t('ana.sel.all') }}
          </button>
          <button class="sel-pill" @click="exitSelectMode">{{ t('common.cancel') }}</button>
        </template>
      </div>
      <span v-if="!rows.length" class="ana-empty">{{ t('ana.noClips') }}</span>
      <div v-for="r in rows" :key="r.name" class="clip-row" @click="onRowClick(r)">
        <span v-if="selectMode" class="clip-check" :class="{ on: selected.has(r.name) }">
          <i v-if="selected.has(r.name)" class="ph-bold ph-check"></i>
        </span>
        <span class="clip-thumb">
          <video :src="thumbUrl(r)" preload="metadata" muted></video>
          <i class="ph-fill ph-play"></i>
        </span>
        <span class="clip-copy">
          <span class="clip-time">{{ r.time }}</span>
          <span class="clip-text">{{ r.text }}</span>
        </span>
      </div>

    </div>

    <!-- ── 선택 모드 하단 바 ── -->
    <div v-if="selectMode" class="sel-bar">
      <span class="sel-count">{{ t('ana.sel.count', { count: selectedCount }) }}</span>
      <button class="sel-delete" :class="{ armed: selectedCount }" :disabled="!selectedCount" @click="deleteSelected">
        {{ t('common.delete') }}
      </button>
    </div>

    <ClipPlayerModal
      :open="!!playing"
      :src="playerSrc"
      :title="playing?.title || ''"
      :desc="playing?.desc || ''"
      @close="playing = null"
    />
  </div>
</template>

<style scoped>
.analysis-tab {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── 날짜 이동 ── */
.ana-datebar {
  flex: none;
  margin: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.date-btn {
  width: 40px; height: 40px;
  border-radius: 10px;
  border: none;
  background: var(--color-neutral-900);
  color: var(--color-neutral-400);
  font-size: 15px;
  cursor: pointer;
}
.date-btn:disabled { opacity: 0.35; cursor: default; }
.date-label {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* ── 본문 스크롤 영역 ── */
.ana-body {
  flex: 1;
  min-height: 0;
  overflow: auto; /* overscroll contain은 global.css 공통 목록에 등록 */
  margin-top: 12px;
  padding: 0 16px 10px;
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.ana-empty {
  flex: none;
  padding: 18px 0;
  text-align: center;
  font-size: 12.8px;
  color: var(--color-neutral-500);
}

/* ── 인사이트 카드 ── */
.ana-highlight {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 15px;
  border: 1px solid var(--color-accent-700);
  background: var(--color-accent-900);
}
.hl-icon {
  flex: none;
  font-size: 20px;
  color: var(--color-accent);
}
.hl-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.hl-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
}
.hl-sub {
  font-size: 12px;
  color: var(--color-neutral-400);
}

/* ── 키워드 카드 ── */
.ana-card {
  flex: none;
  padding: 14px 16px 12px;
  border-radius: 15px;
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
  color: inherit;
}
.card-head.on .card-name { color: var(--color-accent); }
.card-name {
  font-size: 13.5px;
  font-weight: 600;
}
.card-total {
  font-size: 12px;
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
}

/* ── 24시간 히트맵 스트립 — 강도는 accent 농도 4단계(컬러셋 방침) ── */
.strip {
  display: flex;
  gap: 2px;
  height: 26px;
}
.cell {
  flex: 1;
  min-width: 0;
  border-radius: 3px;
  border: none;
  padding: 0;
  cursor: pointer;
}
.cell.lv0 { background: var(--color-neutral-800); cursor: default; }
.cell.lv1 { background: color-mix(in srgb, var(--color-accent) 18%, var(--color-surface)); }
.cell.lv2 { background: color-mix(in srgb, var(--color-accent) 38%, var(--color-surface)); }
.cell.lv3 { background: color-mix(in srgb, var(--color-accent) 62%, var(--color-surface)); }
.cell.lv4 { background: color-mix(in srgb, var(--color-accent) 88%, var(--color-surface)); }
.cell.on {
  outline: 1.5px solid var(--color-accent);
  outline-offset: 1px;
}

.ruler {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
  padding: 0 1px;
}

/* ── 오늘의 리듬 / 상태 분포 — 상태 색은 accent 농도 3단계 + 부재는 무채색 ── */
.card-head-static {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.rhythm-badge {
  font-size: 11.3px;
  color: var(--color-neutral-500);
  text-align: right;
}
.rhythm-badge.ok {
  color: var(--color-accent);
  font-weight: 700;
}
.rhythm-dev {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--color-text);
}
.state-rows {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.state-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.state-dot {
  flex: none;
  width: 9px; height: 9px;
  border-radius: 5px;
}
.state-name {
  flex: 1;
  font-size: 12.5px;
  color: var(--color-neutral-300);
}
.state-share {
  font-size: 12.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.state-mean {
  font-size: 11px;
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
}

.sc-lying { background: color-mix(in srgb, var(--color-accent) 85%, var(--color-surface)); }
.sc-sitting { background: color-mix(in srgb, var(--color-accent) 50%, var(--color-surface)); }
.sc-standing { background: color-mix(in srgb, var(--color-accent) 22%, var(--color-surface)); }
.sc-unlabeled { background: var(--color-neutral-800); }

.tl-strip {
  display: flex;
  gap: 2px;
  height: 46px;
}
.tl-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-radius: 3px;
  overflow: hidden;
}
.tl-col.empty { background: var(--color-neutral-900); }
.tl-seg {
  width: 100%;
  min-height: 0;
}

/* ── 클립 목록 (기록 탭 리스트뷰 어법) ── */
.clips-head {
  flex: none;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
}
.clips-title {
  margin-right: auto;
  font-size: 12px;
  color: var(--color-neutral-500);
}
.clips-title b {
  color: var(--color-neutral-300);
  font-variant-numeric: tabular-nums;
}
.drill-chip {
  height: 28px;
  padding: 0 11px;
  border-radius: 100px;
  border: 1px solid var(--color-accent-700);
  background: var(--color-accent-900);
  color: var(--color-accent);
  font-size: 11.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.drill-chip i { font-size: 11px; }

.clip-row {
  flex: none;
  display: flex;
  gap: 10px;
  align-items: center;
  cursor: pointer;
}
.sel-pill {
  height: 30px;
  padding: 0 13px;
  border-radius: 100px;
  border: none;
  background: var(--color-neutral-900);
  color: var(--color-neutral-400);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}
.sel-pill.accent { color: var(--color-accent); }
.sel-pill:disabled { opacity: 0.45; cursor: default; }
.clip-check {
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
.clip-check.on {
  border: 1px solid var(--color-accent);
  background: var(--color-accent);
}
.clip-check i {
  font-size: 12px;
  color: var(--color-bg);
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
  background: var(--color-accent-900);
  color: var(--color-accent);
}
.clip-thumb {
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
.clip-thumb video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}
.clip-thumb i {
  position: relative;
  font-size: 15px;
  color: rgba(233, 233, 237, 0.85);
  text-shadow: 0 0 6px rgba(0, 0, 0, 0.6);
}
.clip-copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.clip-time {
  font-size: 11px;
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
}
.clip-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-neutral-300);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
