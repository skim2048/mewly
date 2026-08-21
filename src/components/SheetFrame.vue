<script setup>
defineProps({
  title: { type: String, default: '' },
  closable: { type: Boolean, default: true },
})
const emit = defineEmits(['close'])

// @claude 시안: 배경 클릭은 닫기와 같다(강제 비밀번호 변경만 차단).
function onBackdrop(e) {
  if (e.target === e.currentTarget) emit('close')
}
</script>

<template>
  <div class="sheet-backdrop" @click="onBackdrop">
    <div class="sheet-frame" role="dialog" aria-modal="true">
      <div class="sheet-handle"><span></span></div>
      <div class="sheet-head">
        <span class="sheet-title">{{ title }}</span>
        <button v-if="closable" class="sheet-x" @click="emit('close')"><i class="ph ph-x"></i></button>
      </div>
      <div class="sheet-body">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(8, 9, 14, 0.62);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet-frame {
  width: 100%;
  max-height: 88%;
  background: var(--color-surface);
  border-radius: 28px 28px 0 0;
  /* 엣지 투 엣지: 하단 제스처 바 영역만큼 내용 여백 확보 */
  padding-bottom: var(--inset-bottom, env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* @claude 시안의 상향 그림자는 실기기에서 과하게 짙어 제거(사용자 확정) */
}
.sheet-handle {
  height: 22px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sheet-handle span {
  width: 32px; height: 4px;
  border-radius: 2px;
  background: var(--color-neutral-700);
}
.sheet-head {
  flex: none;
  height: 56px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px 0 24px;
}
.sheet-title {
  flex: 1;
  font-size: var(--font-heading);
  font-weight: 700;
}
.sheet-x {
  width: 44px; height: 44px;
  border: none;
  background: none;
  color: var(--color-neutral-300);
  font-size: 20px;
  cursor: pointer;
  border-radius: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sheet-x:active { background: var(--color-neutral-900); }
.sheet-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 24px 28px;
}
</style>
