import { persistentRef } from './storage.js'

// @claude 조명·온도·마이크 제어 — 전부 목업(대응 기기·백엔드 없음). 시안의
// @claude 상태 모델을 로컬 상태로 구동하며, 프리셋·나이트 모드 설정까지
// @claude localStorage에 지속한다. 실기기 연동 시 이 파일 내부만 교체한다.

// 프리셋은 PTZ와 동일한 숫자 4슬롯 체계다(사용자 확정).
const LIGHT_PRESET_DEFAULTS = { 1: 1, 2: 2, 3: 3, 4: 5 } // step(×20%)
const TEMP_PRESET_DEFAULTS = {
  1: { target: 20, mode: 'cool' },
  2: { target: 22, mode: 'cool' },
  3: { target: 24, mode: 'heat' },
  4: { target: 26, mode: 'heat' },
}

const light = persistentRef('device.light', {
  step: 3,            // 0~5 (×20%)
  lastStep: 3,        // 끄기 전 밝기 (다시 켤 때 복원)
  presets: { ...LIGHT_PRESET_DEFAULTS },
  night: { enabled: true, start: '23:00', end: '07:00' },
})

const temp = persistentRef('device.temp', {
  mode: 'cool',       // 'cool' | 'heat'
  target: 22,         // 16~30
  current: 24,        // 목업 현재 온도
  presets: { ...TEMP_PRESET_DEFAULTS },
})

// @claude 구 명명 프리셋(sleep/room/max, sleep/active/eco) 저장값을 슬롯
// @claude 1~3으로 이행하고 4번은 기본값으로 채운다.
if (light.value.presets && light.value.presets.sleep != null) {
  const old = light.value.presets
  light.value = {
    ...light.value,
    presets: { 1: old.sleep, 2: old.room ?? 2, 3: old.max ?? 5, 4: LIGHT_PRESET_DEFAULTS[4] },
  }
}
if (temp.value.presets && temp.value.presets.sleep != null) {
  const old = temp.value.presets
  temp.value = {
    ...temp.value,
    presets: {
      1: old.sleep,
      2: old.active ?? TEMP_PRESET_DEFAULTS[2],
      3: old.eco ?? TEMP_PRESET_DEFAULTS[3],
      4: TEMP_PRESET_DEFAULTS[4],
    },
  }
}

const mic = persistentRef('device.mic', {
  volume: 60,         // 스피커 음량 %
})

export function useDevices() {
  return { light, temp, mic }
}
