<script setup>
import { ref, watch } from 'vue'
import ModalFrame from './ModalFrame.vue'
import { useSSE } from '../composables/useSSE.js'
import { useAnalysis } from '../composables/useAnalysis.js'
import { authFetch } from '../composables/useFetch.js'
import { APP_ENDPOINTS } from '../endpoints.js'
import { useLocale } from '../composables/useLocale.js'

const emit = defineEmits(['close'])

const { state } = useSSE()
const { rejected, clearRejected } = useAnalysis()
const { t } = useLocale()

const prompt = ref('')
const triggers = ref('')
const savedPrompt = ref('')
const savedTriggers = ref('')
const errorNote = ref('')
let loaded = false

watch(
  () => [state.inference_prompt, state.trigger_keywords],
  ([promptText, triggerText]) => {
    if (!loaded && (promptText || triggerText)) {
      prompt.value = savedPrompt.value = promptText || ''
      triggers.value = savedTriggers.value = triggerText || ''
      loaded = true
    }
  },
  { immediate: true },
)

// @claude 시안: 저장은 모달을 유지한 채 「저장했습니다 · 추론 미시작」 안내를
// @claude 띄우고, 취소·닫기·배경 클릭은 마지막 저장 상태로 되돌린 뒤 닫는다.
const applied = ref(false)

watch([prompt, triggers], () => { applied.value = false })

async function apply() {
  if (!prompt.value.trim()) return
  errorNote.value = ''
  try {
    const res = await authFetch(APP_ENDPOINTS.prompt, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.value.trim(), triggers: triggers.value.trim() }),
    })
    const data = await res.json()
    if (data.ok) {
      savedPrompt.value = prompt.value
      savedTriggers.value = triggers.value
      clearRejected()
      applied.value = true
    } else {
      errorNote.value = t('prompt.status.error', { message: data.error || t('prompt.status.unknown') })
    }
  } catch {
    errorNote.value = t('prompt.status.failed')
  }
}

function revertAndClose() {
  prompt.value = savedPrompt.value
  triggers.value = savedTriggers.value
  clearRejected()
  emit('close')
}
</script>

<template>
  <ModalFrame :title="t('set.rowPrompt')" @close="revertAndClose">
    <div class="form-col">
      <div v-if="rejected" class="notice-box">
        <i class="ph ph-info"></i><span>{{ t('prompt.status.needStreaming') }}</span>
      </div>
      <div v-if="errorNote" class="notice-box">
        <i class="ph ph-warning-circle"></i><span>{{ errorNote }}</span>
      </div>
      <!-- 시안: 저장 후 모달을 유지하며 저장·추론 미시작 안내를 표시 -->
      <div v-if="applied" class="notice-box">
        <i class="ph ph-info"></i><span>{{ t('prompt.status.applied') }}</span>
      </div>

      <label class="form-field">{{ t('prompt.label.query') }}
        <textarea v-model="prompt" rows="4" />
      </label>
      <label class="form-field">{{ t('prompt.label.triggers') }}
        <input v-model="triggers" />
      </label>

      <div class="form-actions">
        <button class="form-btn primary" @click="apply">{{ t('common.save') }}</button>
        <button class="form-btn" @click="revertAndClose">{{ t('common.cancel') }}</button>
      </div>
    </div>
  </ModalFrame>
</template>

<style scoped>
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
</style>
