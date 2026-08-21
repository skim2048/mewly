<script setup>
import { computed } from 'vue'
import { useLocale } from '../composables/useLocale.js'

const props = defineProps({
  show: { type: Boolean, default: false },
  remainingSeconds: { type: Number, default: 0 },
  canExtend: { type: Boolean, default: false },
  extending: { type: Boolean, default: false },
})

defineEmits(['extend', 'logout'])
const { t, isKorean } = useLocale()

// 시안 표기: 「남은 시간 2분 40초」 / "2 min 40 s left"
const timeLabel = computed(() => {
  const m = Math.floor(props.remainingSeconds / 60)
  const s = props.remainingSeconds % 60
  if (isKorean.value) return m > 0 ? `${m}분 ${s}초` : `${s}초`
  return m > 0 ? `${m} min ${s} s` : `${s} s`
})
</script>

<template>
  <Teleport to="body">
    <Transition name="session-modal">
      <div v-if="show" class="session-backdrop" role="presentation">
        <div
          class="session-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-expiry-title"
        >
          <span id="session-expiry-title" class="session-title">{{ t('session.title') }}</span>
          <span class="session-copy">{{ t('session.copy', { time: timeLabel }) }}</span>
          <!-- 시안: [로그아웃][연장(액센트, 우측)] -->
          <div class="session-actions">
            <button type="button" class="session-btn" @click="$emit('logout')">
              {{ t('session.logout') }}
            </button>
            <button
              type="button"
              class="session-btn primary"
              :disabled="!canExtend || extending"
              @click="$emit('extend')"
            >
              {{ extending ? t('session.extending') : t('session.extend') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.session-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0, 0, 0, 0.58);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 22px;
}
/* 시안: 구분선 없는 민카드 */
.session-card {
  width: 100%;
  max-width: 420px;
  background: var(--color-surface);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 13px;
  box-shadow: var(--shadow-lg);
}
.session-title {
  font-size: var(--font-heading);
  font-weight: 800;
}
.session-copy {
  font-size: var(--font-body);
  line-height: 1.6;
  color: var(--color-neutral-300);
}
.session-actions {
  display: flex;
  gap: 8px;
}
.session-btn {
  flex: 1;
  height: 46px;
  border-radius: 10px;
  border: none;
  background: var(--color-neutral-900);
  color: var(--color-neutral-300);
  font-size: var(--font-body);
  font-family: inherit;
  cursor: pointer;
}
.session-btn.primary {
  background: var(--color-accent);
  color: var(--color-bg);
  font-weight: 700;
}
.session-btn:disabled { opacity: 0.5; cursor: default; }

.session-modal-enter-active,
.session-modal-leave-active { transition: opacity 0.2s; }
.session-modal-enter-from,
.session-modal-leave-to { opacity: 0; }
</style>
