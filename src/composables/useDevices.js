import { persistentRef } from './storage.js'

// @claude 조명·온도·마이크 제어 — 전부 목업(대응 기기·백엔드 없음). 시안의
// @claude 상태 모델을 로컬 상태로 구동하며, 프리셋·나이트 모드 설정까지
// @claude localStorage에 지속한다. 실기기 연동 시 이 파일 내부만 교체한다.

const light = persistentRef('device.light', {
  step: 3,            // 0~5 (×20%)
  lastStep: 3,        // 끄기 전 밝기 (다시 켤 때 복원)
  presets: { sleep: 1, room: 3, max: 5 },
  night: { enabled: true, start: '23:00', end: '07:00' },
})

const temp = persistentRef('device.temp', {
  mode: 'cool',       // 'cool' | 'heat'
  target: 22,         // 16~30
  current: 24,        // 목업 현재 온도
  presets: {
    sleep: { target: 24, mode: 'cool' },
    active: { target: 22, mode: 'cool' },
    eco: { target: 26, mode: 'heat' },
  },
})

const mic = persistentRef('device.mic', {
  volume: 60,         // 스피커 음량 %
})

// 자동 순찰 — 백엔드 미지원, 형태만 (interval 초 단위, 0 아님 = 사용)
const patrol = persistentRef('device.patrol', {
  enabled: false,
  intervalSec: 30,
})

export function useDevices() {
  return { light, temp, mic, patrol }
}
