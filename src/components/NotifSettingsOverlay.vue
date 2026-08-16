<script setup>
import { computed } from 'vue'
import { useLocale } from '../composables/useLocale.js'
import { useNotifSettings } from '../composables/useNotifSettings.js'
import ToggleSwitch from './ToggleSwitch.vue'

const emit = defineEmits(['close'])

const { t } = useLocale()
const { settings, permissionGranted, toggle } = useNotifSettings()

const schedOn = computed({
  get: () => settings.value.sched,
  set: () => toggle('sched'),
})
const abnOn = computed({
  get: () => settings.value.abn,
  set: () => toggle('abn'),
})
</script>

<template>
  <div class="notifset-overlay">
    <div class="overlay-head">
      <button class="head-btn" @click="emit('close')"><i class="ph ph-arrow-left"></i></button>
      <span class="head-title">{{ t('notif.title') }}</span>
    </div>

    <div class="notifset-body">
      <div v-if="!permissionGranted" class="notice-box">
        <i class="ph ph-bell-slash"></i>
        <span>{{ t('notifSet.permWarn') }}<br><b>{{ t('notifSet.openSysSet') }}</b></span>
      </div>

      <div class="switch-card">
        <div class="switch-row divided">
          <span class="switch-copy">
            <span class="switch-title">{{ t('notifSet.schedTitle') }}</span>
            <span class="switch-sub">{{ t('notifSet.schedSub') }}</span>
            <span class="switch-foot">
              <i class="ph ph-warning-circle"></i>
              <span>{{ t('notifSet.foot') }}</span>
            </span>
          </span>
          <ToggleSwitch v-model="schedOn" />
        </div>
        <div class="switch-row">
          <span class="switch-copy">
            <span class="switch-title">{{ t('notifSet.abnTitle') }}</span>
            <span class="switch-sub">{{ t('notifSet.abnSub') }}</span>
          </span>
          <ToggleSwitch v-model="abnOn" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notifset-overlay {
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

.notifset-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.notice-box {
  display: flex;
  gap: 9px;
  padding: 11px 12px;
  border-radius: 8px;
  background: var(--color-neutral-900);
  border-left: 2px solid var(--color-accent);
  align-items: flex-start;
  font-size: 12.3px;
  line-height: 1.55;
  color: var(--color-neutral-300);
}
.notice-box i {
  flex: none;
  font-size: 15.8px;
  color: var(--color-accent);
  margin-top: 1px;
}
.notice-box b { color: var(--color-accent); }

.switch-card {
  border-radius: 12px;
  background: var(--color-neutral-900);
  display: flex;
  flex-direction: column;
}
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 15px;
}
.switch-row.divided { border-bottom: 1px solid var(--color-divider); }
.switch-copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.switch-title {
  font-size: 14px;
  font-weight: 700;
}
.switch-sub {
  font-size: 11.5px;
  color: var(--color-neutral-400);
}
.switch-foot {
  display: flex;
  gap: 5px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--color-neutral-400);
  margin-top: 4px;
}
.switch-foot i {
  flex: none;
  font-size: 13px;
  color: var(--color-accent-300);
  margin-top: 2px;
}
</style>
