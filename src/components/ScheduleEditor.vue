<script setup>
import { computed, ref } from 'vue'
import { useLocale, formatDateTime } from '../composables/useLocale.js'
import {
  useSchedules, CATEGORIES, CATEGORY_CUSTOM, ALARM_OPTIONS, REPEAT_OPTIONS, REPEAT_NONE, optionLabel,
} from '../composables/useSchedules.js'
import { useNotifSettings } from '../composables/useNotifSettings.js'
import { parseIsoDate } from '../composables/dates.js'
import OverlayFrame from './OverlayFrame.vue'
import ToggleSwitch from './ToggleSwitch.vue'

const props = defineProps({
  scheduleId: { type: [Number, null], default: null },
  date: { type: String, required: true },
})
const emit = defineEmits(['close'])

const { t, locale } = useLocale()
const { getSchedule, addSchedule, updateSchedule, removeSchedule } = useSchedules()
const { permissionGranted } = useNotifSettings()

const editing = props.scheduleId != null ? getSchedule(props.scheduleId) : null

const CATEGORY_NAMES = CATEGORIES.map((c) => c.ko)
const form = ref(editing
  ? {
    cat: CATEGORY_NAMES.includes(editing.title) ? editing.title : CATEGORY_CUSTOM.ko,
    custom: CATEGORY_NAMES.includes(editing.title) ? '' : editing.title,
    allDay: !!editing.allDay,
    start: editing.time || '09:00',
    end: editing.end || editing.time || '10:00',
    alarm: editing.alarm,
    repeat: editing.repeat,
  }
  : { cat: null, custom: '', allDay: false, start: '15:00', end: '16:00', alarm: ALARM_OPTIONS[2].v, repeat: REPEAT_NONE })
const error = ref('')

const dateLabel = computed(() =>
  formatDateTime(parseIsoDate(props.date), { month: 'long', day: 'numeric' }),
)

const CAT_ALL = [...CATEGORIES, CATEGORY_CUSTOM]
const catChips = computed(() => CAT_ALL.map((c) => ({
  value: c.ko,
  label: optionLabel(CAT_ALL, c.ko, locale.value),
  custom: c.ko === CATEGORY_CUSTOM.ko,
})))
const isCustomCat = computed(() => form.value.cat === CATEGORY_CUSTOM.ko)

const timeOptions = (() => {
  const list = []
  for (let hh = 0; hh < 24; hh++) {
    for (const mm of ['00', '30']) list.push(`${String(hh).padStart(2, '0')}:${mm}`)
  }
  return list
})()

const timeErr = computed(() => !form.value.allDay && form.value.end < form.value.start)

function pickCat(value) {
  form.value.cat = value
  error.value = ''
}

function save() {
  const f = form.value
  if (!f.cat) { error.value = t('sched.errCat'); return }
  if (f.cat === CATEGORY_CUSTOM.ko && !f.custom.trim()) { error.value = t('sched.errName'); return }
  if (timeErr.value) { error.value = t('sched.timeErr'); return }
  const title = f.cat === CATEGORY_CUSTOM.ko ? f.custom.trim() : f.cat
  const base = {
    title,
    alarm: f.alarm,
    repeat: f.repeat,
    allDay: f.allDay,
    time: f.allDay ? undefined : f.start,
    end: f.allDay ? undefined : f.end,
  }
  if (editing) updateSchedule(editing.id, base)
  else addSchedule({ date: props.date, ...base })
  emit('close')
}

function remove() {
  if (editing) removeSchedule(editing.id)
  emit('close')
}
</script>

<template>
  <OverlayFrame :title="editing ? t('sched.edit') : t('sched.new')" icon="x" @close="emit('close')">
    <template #actions>
      <button class="head-save" @click="save">{{ t('common.save') }}</button>
    </template>

    <div class="editor-body">
      <span class="date-label">{{ dateLabel }}</span>

      <div v-if="!permissionGranted" class="notice-box">
        <i class="ph ph-bell-slash"></i>
        <span>{{ t('sched.permWarn') }} <b>{{ t('notifSet.openSysSet') }}</b></span>
      </div>

      <div class="field-group">
        <span class="field-label">{{ t('sched.catReq') }}</span>
        <div class="chip-row">
          <button
            v-for="c in catChips"
            :key="c.value"
            class="cat-chip"
            :class="{ on: form.cat === c.value, custom: c.custom }"
            @click="pickCat(c.value)"
          >{{ c.label }}</button>
        </div>
        <input
          v-if="isCustomCat"
          v-model="form.custom"
          class="custom-input"
          :placeholder="t('sched.customPh')"
        >
        <div v-if="error" class="notice-box">
          <i class="ph ph-warning-circle"></i>
          <span>{{ error }}</span>
        </div>
      </div>

      <div class="field-group">
        <div class="allday-row">
          <span class="field-label">{{ t('sched.allDay') }}</span>
          <ToggleSwitch v-model="form.allDay" />
        </div>
        <template v-if="!form.allDay">
          <div class="select-grid">
            <label class="select-box">{{ t('sched.start') }}
              <select v-model="form.start">
                <option v-for="o in timeOptions" :key="o" :value="o">{{ o }}</option>
              </select>
            </label>
            <label class="select-box" :class="{ err: timeErr }">{{ t('sched.end') }}
              <select v-model="form.end" :class="{ err: timeErr }">
                <option v-for="o in timeOptions" :key="o" :value="o">{{ o }}</option>
              </select>
            </label>
          </div>
          <span v-if="timeErr" class="time-err">
            <i class="ph ph-warning-circle"></i>{{ t('sched.timeErr') }}
          </span>
        </template>
      </div>

      <div class="select-grid">
        <label class="select-box">{{ t('sched.alarm') }}
          <select v-model="form.alarm">
            <option v-for="o in ALARM_OPTIONS" :key="o.v" :value="o.v">
              {{ optionLabel(ALARM_OPTIONS, o.v, locale) }}
            </option>
          </select>
        </label>
        <label class="select-box">{{ t('sched.repeat') }}
          <select v-model="form.repeat">
            <option v-for="o in REPEAT_OPTIONS" :key="o.v" :value="o.v">
              {{ optionLabel(REPEAT_OPTIONS, o.v, locale) }}
            </option>
          </select>
        </label>
      </div>

      <button v-if="editing" class="delete-btn" @click="remove">{{ t('sched.delete') }}</button>
    </div>
  </OverlayFrame>
</template>

<style scoped>
.head-save {
  height: 38px;
  padding: 0 16px;
  border-radius: 100px;
  border: none;
  background: var(--color-accent-900);
  color: var(--color-text);
  font-size: 12.8px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}

.editor-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.date-label {
  font-size: 12px;
  color: var(--color-neutral-500);
}

.notice-box {
  display: flex;
  gap: 9px;
  padding: 11px 12px;
  border-radius: 8px;
  background: var(--color-neutral-900);
  border-left: 2px solid var(--color-accent);
  align-items: flex-start;
  font-size: 12px;
  line-height: 1.55;
  color: var(--color-neutral-300);
}
.notice-box i {
  flex: none;
  font-size: 15px;
  color: var(--color-accent);
  margin-top: 1px;
}
.notice-box b { color: var(--color-accent); }

.field-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.field-label {
  font-size: 12px;
  color: var(--color-neutral-500);
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cat-chip {
  height: 38px;
  padding: 0 14px;
  border-radius: 100px;
  border: 1px solid transparent;
  background: var(--color-neutral-900);
  color: var(--color-neutral-400);
  font-size: 12.8px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}
.cat-chip.custom {
  background: none;
  border-color: var(--color-neutral-700);
  border-style: dashed;
}
.cat-chip.on {
  background: var(--color-accent-900);
  border-color: transparent;
  color: var(--color-text);
  font-weight: 700;
}
.custom-input {
  height: 44px;
  border-radius: 10px;
  border: none;
  background: var(--color-neutral-900);
  color: var(--color-text);
  padding: 0 13px;
  font-size: 13.5px;
  font-family: inherit;
  outline: none;
}

.allday-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.select-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}
.select-box {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 11px 13px;
  border-radius: 10px;
  background: var(--color-neutral-900);
  font-size: 11.5px;
  color: var(--color-neutral-500);
}
.select-box.err { outline: 1px solid var(--color-accent); }
.select-box select {
  border: none;
  background: none;
  color: var(--color-text);
  font-size: 13.8px;
  font-weight: 700;
  font-family: inherit;
  outline: none;
  cursor: pointer;
}
.select-box select.err { color: var(--color-accent); }
.time-err {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  color: var(--color-neutral-300);
}
.time-err i {
  flex: none;
  font-size: 14px;
  color: var(--color-accent);
  margin-top: 1px;
}

.delete-btn {
  height: 48px;
  border-radius: 10px;
  border: none;
  background: var(--danger-bg);
  color: var(--danger);
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  margin-top: 6px;
}
</style>
