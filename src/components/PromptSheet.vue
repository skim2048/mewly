<script setup>
import { computed, ref, watch } from 'vue'
import ModalFrame from './ModalFrame.vue'
import { useSSE } from '../composables/useSSE.js'
import { useAnalysis } from '../composables/useAnalysis.js'
import { authFetch } from '../composables/useFetch.js'
import { APP_ENDPOINTS } from '../endpoints.js'
import { useLocale } from '../composables/useLocale.js'
import { toIsoDate } from '../composables/dates.js'
import { markPromptApplied, DAY_PROMPT } from '../composables/analysisConfig.js'

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
const applying = ref(false)

// ── 프롬프트 보호 장치(사용자 확정) — §10 사고(문장 수 제약 → 무라벨 85%) 재발 방지.
// 검증 원형과 다르면 상시 경고를 표시하고, 프롬프트 본문을 바꾸는 저장은
// 2단계 확인을 거친다. 키워드 변경은 위험 요인이 아니므로 확인 없이 저장한다.
const confirmArm = ref(false)
const offVerified = computed(() => prompt.value.trim() !== DAY_PROMPT)
const promptChanging = computed(() => prompt.value.trim() !== savedPrompt.value.trim())

function restoreVerified() {
  prompt.value = DAY_PROMPT
}

watch([prompt, triggers], () => { applied.value = false; confirmArm.value = false })

async function apply() {
  if (!prompt.value.trim() || applying.value) return
  // 프롬프트 본문 변경은 1차 탭에서 무장(확인 안내)만 하고, 2차 탭에서 적용한다
  if (promptChanging.value && !confirmArm.value) {
    confirmArm.value = true
    return
  }
  confirmArm.value = false
  applying.value = true
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
      // 프롬프트 변경은 라벨 분포를 바꾸므로 기준선 단절을 기록한다 (회신서 §10)
      markPromptApplied(prompt.value.trim(), toIsoDate())
    } else {
      errorNote.value = t('prompt.status.error', { message: data.error || t('prompt.status.unknown') })
    }
  } catch {
    errorNote.value = t('prompt.status.failed')
  }
  applying.value = false
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

      <!-- 검증 원형 이탈 경고 + 복원 (사용자 확정: 프롬프트 보호 장치) -->
      <div v-if="offVerified" class="guard-box">
        <span>{{ t('prompt.guard.note') }}</span>
        <button class="guard-restore" @click="restoreVerified">{{ t('prompt.guard.restore') }}</button>
      </div>
      <span v-if="confirmArm" class="guard-confirm">{{ t('prompt.guard.confirm') }}</span>

      <div class="form-actions">
        <button
          class="form-btn primary"
          :class="{ busy: applying, danger: confirmArm }"
          :disabled="applying"
          :aria-busy="applying"
          @click="apply"
        >{{ confirmArm ? t('prompt.guard.applyAnyway') : t('common.save') }}</button>
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
  font-size: var(--font-body);
  line-height: 1.55;
  color: var(--color-neutral-300);
}
.notice-box i {
  flex: none;
  font-size: 15.8px;
  color: var(--color-accent);
  margin-top: 1px;
}
.guard-box {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 11px 12px;
  border-radius: 8px;
  background: var(--color-neutral-900);
  border-left: 2px solid var(--color-danger);
  font-size: var(--font-label);
  line-height: 1.55;
  color: var(--color-neutral-300);
}
.guard-restore {
  align-self: flex-start;
  height: 30px;
  padding: 0 12px;
  border-radius: 100px;
  border: none;
  background: var(--color-neutral-800);
  color: var(--color-text);
  font-size: var(--font-label);
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}
.guard-confirm {
  font-size: var(--font-label);
  line-height: 1.5;
  color: var(--color-danger);
}
</style>
