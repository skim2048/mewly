import { computed } from 'vue'
import { persistentRef } from './storage.js'
import { t } from './useLocale.js'

// @claude 시안의 견종 목록. 한국어 명칭을 canonical 값으로 저장하고 영어는
// @claude 표시 시 변환한다. '기타'는 목록 밖 저장을 위한 예약 값이다.
export const BREEDS = [
  { ko: '골든 리트리버', en: 'Golden Retriever' },
  { ko: '닥스훈트', en: 'Dachshund' },
  { ko: '말티즈', en: 'Maltese' },
  { ko: '말티푸', en: 'Maltipoo' },
  { ko: '비숑 프리제', en: 'Bichon Frise' },
  { ko: '시바견', en: 'Shiba Inu' },
  { ko: '시추', en: 'Shih Tzu' },
  { ko: '진돗개', en: 'Jindo' },
  { ko: '치와와', en: 'Chihuahua' },
  { ko: '토이 푸들', en: 'Toy Poodle' },
  { ko: '포메라니안', en: 'Pomeranian' },
  { ko: '웰시 코기', en: 'Welsh Corgi' },
]
export const BREED_OTHER = { ko: '기타', en: 'Other' }

export function breedLabel(breed, locale) {
  if (locale !== 'en') return breed
  if (breed === BREED_OTHER.ko) return BREED_OTHER.en
  return BREEDS.find((b) => b.ko === breed)?.en ?? breed
}

// 기본값은 빈 프로필 — 더미 이름·견종·생일을 남기지 않는다 (사용자 확정)
const profile = persistentRef('profile', {
  name: '',
  breed: '',
  birth: '',
  photo: '', // 축소된 JPEG data URL (미등록 시 빈 문자열)
  notes: '', // 특징 — 성격·습관 등 자유 기록
})

export function useProfile() {
  // 나이는 「X년 Y개월」로 표기한다 (사용자 확정). 0년·0개월은 자연 생략.
  const ageText = computed(() => {
    if (!profile.value.birth) return ''
    const birth = new Date(profile.value.birth)
    if (Number.isNaN(birth.getTime())) return ''
    const now = new Date()
    let months = (now.getFullYear() - birth.getFullYear()) * 12
      + (now.getMonth() - birth.getMonth())
    if (now.getDate() < birth.getDate()) months -= 1
    months = Math.max(0, months)
    const y = Math.floor(months / 12)
    const m = months % 12
    if (y && m) return t('profile.ageYm', { y, m })
    if (y) return t('profile.ageY', { y })
    return t('profile.ageM', { m })
  })

  // 화면 표기 YY-MM-DD (내부는 ISO)
  const birthLabel = computed(() => (profile.value.birth ? profile.value.birth.replace(/^\d{2}/, '') : '—'))

  return { profile, ageText, birthLabel }
}
