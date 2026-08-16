<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <button
    type="button"
    class="toggle"
    :class="{ on: modelValue }"
    role="switch"
    :aria-checked="modelValue"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span class="knob"></span>
  </button>
</template>

<style scoped>
/* 시안 사양: 46×26, 노브 22, 켜짐=accent(노브는 배경색) */
.toggle {
  flex: none;
  width: 46px; height: 26px;
  border-radius: 14px;
  border: none;
  background: var(--color-neutral-800);
  position: relative;
  cursor: pointer;
  padding: 0;
}
.toggle.on { background: var(--color-accent); }
.knob {
  position: absolute;
  top: 2px; left: 2px;
  width: 22px; height: 22px;
  border-radius: 11px;
  background: var(--color-neutral-500);
  transition: left 0.15s;
}
.toggle.on .knob {
  left: 22px;
  background: var(--color-bg);
}
</style>
