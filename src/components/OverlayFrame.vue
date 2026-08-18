<script setup>
defineProps({
  title: { type: String, default: '' },
  // 'back' = 이전 화면 복귀(←), 'x' = 닫기(×) — 시안의 두 헤더 유형
  icon: { type: String, default: 'back' },
})
const emit = defineEmits(['close'])
</script>

<template>
  <div class="overlay-shell">
    <div class="overlay-head">
      <button class="head-btn" @click="emit('close')">
        <i :class="icon === 'back' ? 'ph ph-arrow-left' : 'ph ph-x'"></i>
      </button>
      <span class="head-title">{{ title }}</span>
      <slot name="actions" />
    </div>
    <slot />
  </div>
</template>

<style scoped>
.overlay-shell {
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
</style>
