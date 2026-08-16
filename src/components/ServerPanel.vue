<script setup>
import { ref } from 'vue'
import { useLocale } from '../composables/useLocale.js'
import { useAuth } from '../composables/useAuth.js'
import { getEditableMewlyHost, applyMewlyHost } from '../endpoints.js'

const emit = defineEmits(['close'])

const { t } = useLocale()
const { logout } = useAuth()

const host = ref(getEditableMewlyHost())

// @claude 시안: 주소 변경은 재로그인을 요구한다. 세션에만 적용해 두고
// @claude 로그아웃하면, 로그인 화면이 이 값을 미리 채우고 로그인 성공 시
// @claude 지속한다(기존 applyMewlyHost → persistMewlyHost 흐름).
function save() {
  const next = host.value.trim()
  if (next && next !== getEditableMewlyHost()) {
    applyMewlyHost(next)
    logout({ redirect: true })
    return
  }
  emit('close')
}
</script>

<template>
  <div class="server-panel">
    <div class="notice-box">
      <i class="ph ph-warning-circle"></i>
      <span>{{ t('srv.note') }}</span>
    </div>
    <label class="field">{{ t('srv.addr') }}
      <input v-model="host" spellcheck="false" autocapitalize="off">
    </label>
    <div class="actions">
      <button class="btn primary" @click="save">{{ t('common.save') }}</button>
      <button class="btn" @click="emit('close')">{{ t('common.cancel') }}</button>
    </div>
  </div>
</template>

<style scoped>
.server-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--color-neutral-400);
}
.field input {
  width: 100%;
  box-sizing: border-box;
  height: 44px;
  border-radius: 10px;
  border: 1px solid var(--color-neutral-800);
  background: var(--color-neutral-900);
  color: var(--color-text);
  font-size: 14px;
  font-family: inherit;
  padding: 0 12px;
  outline: none;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}
.btn {
  flex: 1;
  height: 46px;
  border-radius: 10px;
  border: 1px solid var(--color-neutral-800);
  background: var(--color-neutral-900);
  color: var(--color-text);
  font-size: 13.5px;
  font-family: inherit;
  cursor: pointer;
}
.btn.primary {
  border: none;
  background: var(--color-accent);
  color: var(--color-bg);
  font-weight: 700;
}
</style>
