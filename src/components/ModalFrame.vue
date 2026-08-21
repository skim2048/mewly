<script setup>
const props = defineProps({
  title: { type: String, default: '' },
  closable: { type: Boolean, default: true },
  // 시안: 비밀번호 모달처럼 X 없이 버튼으로만 닫는 카드가 있다.
  showX: { type: Boolean, default: true },
})
const emit = defineEmits(['close'])

// @claude 시안: 배경 클릭은 닫기와 같다. closable=false(강제 비밀번호 변경)면
// @claude 프레임이 emit 자체를 막아, 부모의 가드 유무와 무관하게 닫히지 않는다.
function onBackdrop(e) {
  if (props.closable && e.target === e.currentTarget) emit('close')
}
</script>

<template>
  <div class="modal-backdrop" @click="onBackdrop">
    <div class="modal-frame" role="dialog" aria-modal="true">
      <div class="modal-head">
        <span class="modal-title">{{ title }}</span>
        <button v-if="closable && showX" class="modal-x" @click="emit('close')"><i class="ph ph-x"></i></button>
      </div>
      <div class="modal-body">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.58);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.modal-frame {
  width: 100%;
  max-height: 100%;
  overflow: auto;
  background: var(--color-surface);
  border: 1px solid var(--color-divider); /* 다크 경계 소실 방지 (실기 지적) */
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow-lg);
}
.modal-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.modal-title {
  flex: 1;
  font-size: var(--font-heading);
  font-weight: 800;
}
.modal-x {
  width: 34px; height: 34px;
  border: none;
  background: none;
  color: var(--color-neutral-400);
  font-size: 18px;
  cursor: pointer;
  border-radius: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-x:active { background: var(--color-neutral-900); }
.modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
