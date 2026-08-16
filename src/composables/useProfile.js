import { computed } from 'vue'
import { persistentRef } from './storage.js'

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

const profile = persistentRef('profile', {
  name: '콩이',
  breed: '말티즈',
  birth: '2023-03-14',
})

export function useProfile() {
  const ageYears = computed(() => {
    const birth = new Date(profile.value.birth)
    if (Number.isNaN(birth.getTime())) return 0
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    const beforeBirthday = now.getMonth() < birth.getMonth()
      || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
    if (beforeBirthday) age -= 1
    return Math.max(0, age)
  })

  // 화면 표기 YY-MM-DD (내부는 ISO)
  const birthLabel = computed(() => profile.value.birth.replace(/^\d{2}/, ''))

  return { profile, ageYears, birthLabel }
}
