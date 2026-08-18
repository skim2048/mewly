<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLocale } from '../composables/useLocale.js'
import { useAuth } from '../composables/useAuth.js'
import { getEditableMewlyHost, applyMewlyHost } from '../endpoints.js'

const emit = defineEmits(['close'])

const router = useRouter()
const { t } = useLocale()
const { logout } = useAuth()

const host = ref(getEditableMewlyHost())
const saving = ref(false)

// @claude 시안: 주소 변경은 재로그인을 요구한다. 토큰 해지는 반드시 구
// @claude 호스트로 전송되어야 하므로, 로그아웃(해지) 완료를 기다린 뒤에
// @claude 새 주소를 세션에 적용한다. 로그인 화면이 이 값을 미리 채우고
// @claude 로그인 성공 시 지속한다(기존 applyMewlyHost → persistMewlyHost 흐름).
async function save() {
  const next = host.value.trim()
  if (!next || next === getEditableMewlyHost()) {
    emit('close')
    return
  }
  saving.value = true
  await logout({ redirect: false })
  applyMewlyHost(next)
  router.push({ name: 'login' })
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
      <button class="btn primary" :disabled="saving" @click="save">{{ t('common.save') }}</button>
      <button class="btn" :disabled="saving" @click="emit('close')">{{ t('common.cancel') }}</button>
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
.btn:disabled { opacity: 0.5; cursor: default; }
.btn.primary {
  border: none;
  background: var(--color-accent);
  color: var(--color-bg);
  font-weight: 700;
}
</style>
