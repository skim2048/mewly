<script setup>
import { ref } from 'vue'
import { authFetch } from '../composables/useFetch.js'
import { API_ENDPOINTS } from '../endpoints.js'
import { useLocale } from '../composables/useLocale.js'

const emit = defineEmits(['close'])
// @claude Forced first-login mode (FR-006): no cancel until the change succeeds.
const props = defineProps({ forced: { type: Boolean, default: false } })

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const loading = ref(false)
const { t } = useLocale()

async function handleChange() {
  error.value = ''

  if (currentPassword.value === newPassword.value) {
    error.value = t('changePassword.error.sameAsCurrent')
    return
  }
  if (newPassword.value.length < 4) {
    error.value = t('changePassword.error.minLength')
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = t('changePassword.error.mismatch')
    return
  }

  loading.value = true
  try {
    const res = await authFetch(API_ENDPOINTS.changePassword, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_password: currentPassword.value,
        new_password: newPassword.value,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      error.value = body.detail || t('changePassword.error.requestFailed')
      return
    }
    // 시안: 변경 성공 시 모달을 닫는다 (강제 모드 해제 포함)
    emit('close')
  } catch {
    error.value = t('changePassword.error.network')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="pw-panel">
    <!-- 시안: 강제 모드 안내는 상자 없이 본문 텍스트로 표시한다 -->
    <span v-if="props.forced" class="pw-forced">{{ t('changePassword.forcedNotice') }}</span>
    <div v-if="error" class="notice-box">
      <i class="ph ph-warning-circle"></i><span>{{ error }}</span>
    </div>

    <!-- 시안: 라벨 없이 placeholder 3개 -->
    <input
      v-model="currentPassword"
      type="password"
      class="pw-input"
      :placeholder="t('changePassword.field.current')"
      autocomplete="current-password"
    />
    <input
      v-model="newPassword"
      type="password"
      class="pw-input"
      :placeholder="t('changePassword.field.new')"
      autocomplete="new-password"
    />
    <input
      v-model="confirmPassword"
      type="password"
      class="pw-input"
      :placeholder="t('changePassword.field.confirm')"
      autocomplete="new-password"
    />

    <!-- 시안: [취소][변경(액센트, 우측)] — 강제 모드에서는 취소 없음 -->
    <div class="pw-actions">
      <button v-if="!props.forced" class="pw-btn" @click="emit('close')">
        {{ t('changePassword.action.cancel') }}
      </button>
      <button class="pw-btn primary" :disabled="loading" @click="handleChange">
        {{ loading ? t('changePassword.action.loading') : t('changePassword.action.submit') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.pw-panel {
  display: flex;
  flex-direction: column;
  gap: 13px;
}
.pw-forced {
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--color-neutral-400);
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
.pw-input {
  height: 46px;
  border-radius: 10px;
  border: 1px solid var(--color-neutral-800);
  background: var(--color-neutral-900);
  color: var(--color-text);
  font-size: 14px;
  font-family: inherit;
  padding: 0 13px;
  outline: none;
}
.pw-input:focus-visible { outline: 2px solid var(--color-accent); }
.pw-actions {
  display: flex;
  gap: 8px;
}
.pw-btn {
  flex: 1;
  height: 46px;
  border-radius: 10px;
  border: none;
  background: var(--color-neutral-900);
  color: var(--color-neutral-300);
  font-size: 13.5px;
  font-family: inherit;
  cursor: pointer;
}
.pw-btn.primary {
  background: var(--color-accent);
  color: var(--color-bg);
  font-weight: 700;
}
.pw-btn:disabled { opacity: 0.5; cursor: default; }
</style>
