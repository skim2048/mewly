# babycat 협의·작업 기록 보존본 (2026-08)

이 문서는 구 tmp/의 세 원문 — analysis-reply.md(babycat→mewly 회신 인계서), inference-labels-empty.md(라벨 공백 회신), redesign-worklog.md(재설계 작업 문서) — 을 병합한 요약 보존본이다. 코드 주석이 「회신서 §7.4.1」, 「analysis-reply.md §13.2」, 「inference-labels-empty.md §3.3」 형식으로 원문을 지목하므로 각 부의 절 번호는 원문 그대로 유지한다. 완결된 판정·계약만 남기고 진행 경과 서술은 덜어냈다.

---

# 1부. analysis-reply.md (babycat → mewly, 2026-08-20 ~ 08-26)

analysis-handoff.md(mewly→babycat)에 대한 회신. 실험 상세는 babycat tmp/experiment/report.md.

## §1 목표의 재정의

- 관찰 공간이 펫하우스 내부(개집 규모) ∴ "이상 행동 탐지" 불성립(실측 확정).
- 성립 목표: **개체 기준선 대비 시간 배분의 편차 보고** — 자세 상태 점유율 시계열 vs 그 개체의 1~2주 기준선.
- 최초 컨텐츠: "오늘의 리듬 카드"(평소 범위 이탈 항목만 표시, 기본 출력 "이상 없음"). 기준선 비교·서술 생성은 4층 = mewly 몫.

## §2 실험 결과

실기 조건(1초 간격 4장 묶음, 384×384) 재현, 총 약 8,400추론(동물병원 주간 300·야간 IR 320묶음 + 이상행동 8종 229묶음).

- 2층 조건부 성립: 자세 3종(lying·sitting·standing) + 간접 부재 판정. 모델은 VILA1.5-3b 단독(VILA-2.7b는 야간 판별 붕괴로 탈락). 정답률 주간 94% · 야간 92%.
- 출력 강제(JSON) 기각 — 형식 오류·환각 유발. 채택: 자유 서술 출력에 대한 부분 문자열 매치.
- 부재(빈 하우스): empty 라벨 출력 0회. 개를 전제하는 프롬프트는 빈 하우스에서 행동을 지어냄. 자유 서술은 빈 하우스에서 행동 어휘를 포함하지 않음 ∴ "행동 어휘 무매치"가 부재의 간접 신호(12/12 재현).
- 삽화·이상행동(선회·긁음·구토·짖음·기침·발작) 기각 — 근접·선명 조건에서도 민감도 0(예외: 핥음 8/8). 삽화 행동은 기존 트리거 키워드·클립 경로가 담당, 2층 어휘에 넣지 않음.

## §3 확정된 설계 결정

|항목|결론|
|---|---|
|라벨 어휘 주입|트리거 키워드 인터페이스 확장. 라벨별 동의어 그룹 `{"라벨": ["동의어", ...]}`을 클라이언트가 주입, babycat은 부분 문자열 매치만 수행|
|구조화 출력·파싱 실패|출력 강제 없음. 추론 원문을 1층에 항상 보존 ∴ 폐기·재시도 문제 소멸, 어휘 변경 시 과거 이력 재매치 가능|
|추론 이력 저장 주체|recorder 위임. 이력 테이블은 클립과 수명 분리(FR-033 삭제에 휩쓸리지 않음)|
|시간 구간 프리셋|babycat은 "(시각 범위, 프롬프트, 어휘)" 목록의 적용만 지원. 구간 수·경계·문안·어휘는 전부 클라이언트 주입 — babycat은 구간의 의미를 모름(범용성 불변식 유지)|

## §4 mewly가 결정할 사항 (의미 결정권 전부 프론트엔드로)

1. 라벨 어휘·동의어 그룹 — 3종에서 성립 확인. 동의어가 추출률을 좌우(sleeping·resting·curled 등을 lying 그룹에). empty는 라벨로 정의하지 않음.
2. 프리셋 구성 — 검증 프롬프트 2종: 주간형 `Describe the scene.` / 야간형 완성형(→ §7.4.1에서 기각).
3. 4층(리듬 카드) 사양 — 기준선 산출·편차 판정·문안.
4. 집계 소비 — `/summary`는 버킷별 발생 수 + 전체 추론 수(분모) 반환 예정. 추론 주기 가변 ∴ 비율로 정규화.

## §5 babycat 잔여 논의

이력 보존 정책과 `/summary` 질의 형태 — §7.1·§7.2에서 종결.

## §6 구현된 인터페이스 (1·2층, router :8000 경유, 인증 필요)

### POST /presets — 라벨 어휘·프리셋 주입

```json
{"labels": {"lying": ["lying", "sleeping"], "standing": ["standing"]},
 "presets": [{"id": "night", "start": "22:00", "end": "06:00", "prompt": "...", "labels": {"...": ["..."]}}]}
```

- `labels`=기본 어휘, `presets[].labels`=구간 대체 어휘(생략 시 기본), `presets[].prompt` 생략 시 `/prompt`의 프롬프트.
- `start`/`end`는 컨테이너 로컬 "HH:MM", `start >= end`이면 자정을 넘는 구간. 겹치면 목록 순서 우선, 무소속 시각은 프리셋 `default`.
- 보낸 키만 교체. 항목 하나라도 형식 위반 → 400, 아무것도 바꾸지 않음(원자성).
- 재시작 후 복원(FR-014 연장). 프리셋 전환은 추론 사이에서만.

### GET /inferences — 추론 이력 조회 (1층)

- 질의: `label`(정확 일치), `date_from`/`date_to`(`/events` 규약), `limit`(기본 200), `offset`.

```json
{"inferences": [{"id": 1, "created_at": "2026-08-20T16:25:47Z",
  "vlm_text": "The dog is lying on the pad.", "labels": ["lying"],
  "preset": "night", "model": "...", "elapsed_ms": 987}], "total": 1}
```

- 매치 여부와 무관하게 전량 적재, 원문(`vlm_text`) 항상 보존 — 3층 `/summary` 신설 전에는 분석 탭이 이 원자료를 직접 집계.
- 이력 수명은 클립과 무관. 보존 기간 잠정 30일(→ §7.2에서 90일 확정).

## §7 구현 회신(analysis-mewly-impl.md)에 대한 답변

### §7.1 GET /summary 제공 (3층)

- 질의: `date_from`·`date_to`(필수, 로컬 달력 날짜), `bucket`(`hour` | `day`, 기본 `hour`).
- 응답: `{"bucket": "hour", "buckets": [{"bucket_start": "…+09:00", "counts": {"lying": 697}, "total": 705}, …]}` — 버킷 경계는 시스템 로컬(TZ), 빈 버킷도 0으로 포함.
- 전량 조회 부담 → `/summary`로 전환하면 되므로 `fields=` 축소 질의는 만들지 않음. 기준선 다중 기기 → 매번 질의로 충분(localStorage 캐시 불필요).

### §7.2 추론 주기·보존

- analyzer에 추론 시작 간격 하한 `MIN_INFER_INTERVAL`(기본 0) 추가, AGX에 10초 적용 → 하루 8,640추론. 장비마다 주기가 달라도 버킷 `total` 분모가 비교 가능성 담보.
- 보존 기간 `INFERENCE_RETENTION_DAYS` 기본 90일로 상향.

### §7.3 SSE 필드 명문화

`presets`·`label_groups`·`active_preset`을 SDD 외부 인터페이스에 명문화. 그때까지 필드 구성 불변.

### §7.4 → §7.4.1 야간 프롬프트 확정: 주야간 공통 자유 서술 단일

- 실측 1(실운영): 앉은 강아지 인형을 밤새 촬영 — 야간 완성형(word3) 구간은 lying 3,599/3,600 출력(편향), 자유 서술 구간은 sitting 정답. word3의 야간 92%는 판별력이 아니라 lying 편향과 "잠자는 개" 분포의 우연한 일치였음이 확정.
- 실측 2(IR 45장면, 육안 정답 누움 23·부재 11·비누움 11): free 64토큰 — 누움 74%, 부재 무라벨 91%, 비누움 7/11(64%). word3의 비누움 판별 0%와 대비 ∴ free가 야간 판별력을 가진 유일한 형식.
- 확정 권고: 프롬프트 **주야간 공통 "Describe the scene." 단일**(프리셋 시간 구간 불필요 — 기능은 향후 조정 수단으로 유지), `MAX_NEW_TOKENS=64` 전제, **야간 해석은 누움/비누움 2단계**(IR에서 앉음↔서기 혼동 ∴ 3종 세분 신뢰도 낮음). 한계: 야간 lying 오판 3/11 ∴ 뒤척임 다소 과소 계상 가능.

### §7.5 진행 상황·착수 안내 (당시 기준, 전부 해소)

- 즉시 착수 가능이던 것: `/summary` 소비 전환(useInferenceSummary 내부 교체), 일 단위 기준선 전환, 리듬 카드·타임라인 시각화의 사용자 확정 — 전부 수행됨.
- 대기이던 것: 야간 프리셋 문안과 `MAX_NEW_TOKENS` 상향 — §7.4.1로 확정되어 해소.
- 당시 백엔드 작업: 동물병원 NAS에서 야간 IR 표본 60개 확보 → 기계 선별 + 육안 확정 → "야간 × 눕지 않은 자세" 표본으로 free 32·64토큰 판별력 측정 — 결과가 §7.4.1.

### §7.6 해석 단계의 유의

- 기준선 비교는 같은 프리셋 구성끼리만 유효. 어휘·프롬프트 변경 시 기준선 재수집 또는 표시상 단절 안내 필요.
- 버킷이 프리셋 경계에 걸치면 두 프롬프트 출력이 섞임 ∴ 경계를 정각으로 유도(1시간 버킷 정렬).

## §8 반영 결과에 대한 답변

- §8.1 기준선을 `bucket=hour` 14일 범위 질의(336버킷)로 만드는 선택 수용. `bucket=day`는 API에 유지(다른 소비자 여지).
- §8.2 운영 장비 `.env` 확정 3값(`MAX_NEW_TOKENS=64`, `MIN_INFER_INTERVAL=10`, `INFERENCE_RETENTION_DAYS=90`) 반영·재기동 후 실측 확인(행 간격 약 10초, 출력 240~260자) — 종결. 간격 적용은 `/state`의 `cfg_min_infer_interval`로 확인 가능.
- §8.3 빈 프리셋 목록(`presets: []`)은 유효한 설정으로 SDD §6.1에 명문화 — 모든 시간대 기본 설정, 이력 프리셋 식별자 `default`.
- §8.4 v1.0.0 태그 공지 — §11에서 삭제됨. v1.1 후보: `/ptz` 응답 계약 개선("조용히 무시" → "안전하게 무시하되 정직하게 응답", mewly 응답 처리와 동시 배포), 리듬 카드 판정 기준의 사용자 확정이 태그 조건.

## §9 /summary 간헐 500 수정 (mewly 결함 보고에 대한 회신)

- 원인: FastAPI가 동기 의존성(`get_db`)과 핸들러 본문을 서로 다른 스레드에 배정할 수 있는데 sqlite3 기본 설정이 교차 스레드 사용을 금지 ∴ 배정이 어긋난 요청만 간헐 실패.
- 범위: `get_db` 의존 recorder 동기 핸들러 전부(`/events`·`/inferences`·`/status` 포함)의 잠복 결함.
- 수정: `_connect`에 `check_same_thread=False`(요청마다 전용 연결 순차 사용 ∴ 동시성 위험 없음). 검증: `/summary` 120회 연속 성공.
- mewly의 재시도 로직(summaryRetry)은 일시 오류 흡수 용도로 유지.

## §10 프롬프트 변경("in one sentence")의 영향

|          | 변경 전 | 변경 후 |
|---|---|---|
|무라벨|0/150|128/150 (85%)|
|원문 sitting 포함|148|21|

- 원인: 길이 제약 ∴ 한 문장을 가장 두드러진 사실(시선)에 사용, 자세 어휘가 밀려나 매치 실패. §7.6이 경고한 분포 불연속의 실사례.
- 요청 1: 검증 원형("Describe the scene.")으로 원복. 요청 2: 기본 프롬프트도 기준선 단절 서명에 포함(→ mewly markPromptApplied로 반영 완료).
- 프롬프트 변형은 운영 적용 전에 babycat 오프라인 하니스로 사전 측정 가능 — 변형안을 문서로 보내면 추출률 회신.

## §11 되돌림과 그 취소 (2026-08-25)

- 오전의 `7d6a594` 되돌림은 같은 날 취소, master는 `4195e9d`로 복귀 ∴ §1~§10 합의 전부 유효.
- 현재: FR-053~058(추론 이력·라벨·프리셋·집계·간격 하한)·FR-059·NFR-016(TLS) 유효, `GET /inferences`·`GET /summary`·`POST /presets`·`GET/PUT /client/storage/{key}` 제공, Caddy 게이트웨이 + 사설 CA, 8000/tcp = HTTPS. v1.0.0 태그는 재부여 여부 미정.
- §11.2 mewly 요구 조치 없음(https·동봉 CA·`/client/storage/pet_profile` 모두 일치). 환경 변수 `MIN_INFER_INTERVAL`·`INFERENCE_RETENTION_DAYS`·`TLS_EXTRA_HOSTS` 유효.
- §11.3 되돌림 기간의 전수조사 수정(커밋 10건)은 `keep/audit-2026-08-25` 브랜치에 보존 → §12에서 master 재적용. 그 조사가 확인한 `4195e9d` 이전부터의 결함(리프레시 토큰 무조건 발급, 줌 미구현, recorder 세그먼트 정지 미감지)은 §12에서 함께 수정. 조사 결과는 babycat `tmp/audit-7d6a594.md`.

## §12 전수조사 수정의 master 반영 — mewly 계약 영향

### §12.1 응답 형식

|변경 전|변경 후|
|---|---|
|`POST /presets` 거부 `400 {"ok": false, "error"}`|`400 {"detail"}`|
|`POST /vlm/switch` 거부 `400 {"ok": false, "reason"}`|`400 {"detail"}`|
|본문 형식 오류 422|`400 {"detail": "invalid request body"}`|
|streamer 계열 실패 `200 {"ok": false, "error"}`|`409`·`404`·`400`·`502` + `detail` — `ok` 검사 대신 상태 코드로 판정|
|로그인 잠금 429|불변 + `Retry-After` 헤더 CORS 노출|

### §12.2 로그인

`remember_me: true`일 때만 `refresh_token`·`refresh_expires_in` 발급, 아니면 null(FR-002).

### §12.3 /state 스냅숏

- 유지: `label_groups`, `presets`, `active_preset`, `cfg_min_infer_interval`, `ptz_presets`(저장 슬롯 번호 목록), `monitor_sources{analyzer,recorder,streamer}`.
- 제거: `infer_label`, `ring_len`, `ring_size`, `cfg_target_fps`, `cfg_n_frames`, `mediamtx_alive`, `profile_configured`, `ptz_preset_positions`, `ptz_patrol`.
- `pipeline_state_detail`에 `startup`(재기동 시 복원) 값 추가.

### §12.4 PTZ

줌은 범위 밖 확정(대상 카메라에 광학 줌 없음). 알 수 없는 `action` → 400, 미저장 슬롯 `goto` → 404, 위치 미상 `save` → 409.

### §12.5 배포

- 소스 바인드 마운트 제거 ∴ 코드 변경은 재빌드로만 반영. 이미지·패키지 버전 고정(Caddy 2.11.4, MediaMTX 1.20.1).
- `.env` 조정 가능: `TARGET_FPS`·`N_FRAMES`·`VLM_LOAD_TIMEOUT`·`VLM_INFER_TIMEOUT` 추가, 기존 3종 유지. `JWT_SECRET` 제거(§13.1).

### §12.6 반영 시점

이 수정은 커밋만 된 상태였고, 실제 적용은 사용자가 `docker compose up -d --build`로 재빌드·재기동한 시점부터였다(당시 가동 이미지는 되돌림 상태의 코드).

## §13 비밀키 생성과 CA 계층 (2026-08-25)

### §13.1 JWT 서명 비밀키 자동 생성

router가 최초 기동 시 256비트 키를 생성하여 `data/db/router/jwt_secret`(0600)에 보관·재사용(NFR-013 개정). mewly 코드 영향 없음. 기존 보드가 이 코드로 재기동하면 전 토큰 무효 ∴ 전원 1회 재로그인.

### §13.2 TLS 2단계 CA (NFR-016 개정)

|CA|보유자|개인키 위치|역할|
|---|---|---|---|
|Root CA|제조사(개발 PC)|`~/.babycat-ca/root.key`|Device CA에 서명. 인증서는 mewly 동봉|
|Device CA|젯슨 보드 1대|보드의 `data/caddy/caddy/pki/authorities/local/root.key`|기동 시 자기 서버 인증서에 서명|

- 폰은 Root CA 인증서만 보유. 게이트웨이가 서버 인증서 + Device CA 인증서 체인을 전송, Android가 기본 체인 검증 ∴ mewly 코드 변경 없음.
- Device CA의 nameConstraints: 사설 IPv4(10/8·172.16/12·192.168/16)·127/8·`localhost`·`.local`로 서명 범위 제한. 범위 밖 주소의 서버 인증서는 거부됨.

### §13.3 mewly 조치 (전부 완료)

1. 동봉 CA 교체: `res/raw/babycat_ca.crt` = 제조사 Root CA(`O=Babycat, CN=Babycat Root CA`) — 완료(커밋 f8dd471).
2. `network_security_config.xml` 주석 갱신("보호자 CA"→"제조사 Root CA", 앵커 3항목 불변) — 완료(커밋 01a9107).
3. 자체 CA 개발 보드는 그 보드의 `root.crt`를 폰 사용자 CA로 설치. 절차 전체는 babycat `docs/ops/pki.md`.

---

# 2부. inference-labels-empty.md (babycat → mewly, 2026-08-27)

## §1 관측 사실

207 recorder DB: 08-26 7,258건 + 08-27 2,228건 전부 `labels = []`. 원문에는 lying 등 매치될 어휘가 존재. analyzer 상태 파일 `"labels": {}` ∴ 매치 코드의 결함이 아니라 어휘 부재.

## §2 원인

라벨 그룹은 mewly가 `POST /presets`로 주입하고 analyzer는 상태 파일로 보관·복원할 뿐이다. 08-26 새벽 출고 절차 연습으로 207의 `data/`를 전부 삭제 → 상태 파일 소실 → mewly가 재주입하지 않음 → 빈 어휘로 동작. (대조: 206은 `data/`를 지우지 않아 어휘 보존.)

## §3 조치

- §3.1 즉시: mewly에서 라벨 재저장 1회(→ §5.2의 자동 주입으로 대체됨).
- §3.2 지난 이틀 이력: 원문 보존 ∴ 재매치로 복구 가능하나 현 babycat에 재매치 기능 없음. 선택지 — babycat `POST /inferences/rematch` 신설 / mewly 클라이언트 재매치 / 미복구.
- §3.3 재발 방지 두 방향: ① mewly가 보장(접속 시 `label_groups` 비면 주입 — 소유자가 존재도 보장, babycat 변경 없음, **babycat 권고**) ② babycat 기본 어휘 내장(§3의 소유권 결정을 뒤집고 어휘 이원화 위험).

## §5 mewly 회신 (2026-08-27 확정)

- §3.2 → **복구하지 않음**. 시험 기간 데이터이며 기준선 산출이 무라벨을 분모에서 제외 ∴ 통계 오염 없음. 재발 시 rematch API로 정식화.
- §3.3 → **① 채택**. 구현: `analysisConfig.js` `ensureLabelGroupsInjected()`(MainView 마운트 시 기동) — 인증 + 스냅숏 수신 + `monitor_sources.analyzer === true` + `label_groups` 빈 객체이면 `buildLabelsPayload()`를 `POST /presets`로 전송. 세션당 1회 시도(무응답 시 반복 전송 방지, 로그아웃 시 초기화). 동일 서명이면 `presetEpoch` 미갱신 ∴ 기준선 단절 없음.

---

# 3부. redesign-worklog.md (Mewly.dc.html 적용 작업, 2026-08-18 ~ 08-25)

## 상태 커버리지 (시안 조작판 기준, 전부 구현)

- 로그인: idle / busy / unreachable / badauth / locked / replaced. 영상: empty(미등록) / paused / connecting / playing.
- VLM: initializing / downloading / compiling / loading / ready / running / switching / error (dot: wait=accent-300, idle=neutral-500, on=accent, err=text — 시안 고정색을 토큰으로 대체).
- 알림: 유무 × 읽음 × 종류(abn/sched) × 권한. 로그·기록: 유무·무결과. 기기 제어 실패 토스트: timeout / refused / busy.
- 일정 편집 검증: 카테고리 미선택 / 직접 입력 이름 없음 / 종료<시작. 최초 로그인 강제 비밀번호 변경, 세션 만료 모달, 전체화면(+로그 패널).

## 구현 세부 결정

- 화면 전환은 라우터가 아니라 MainView 내부 상태(activeTab·overlay·schedEdit·sheet·modal) — 시안과 동일한 계층 구조.
- 신규 composable: useSchedules·useProfile·useNotifications·useNotifSettings·useDevices. localStorage 키는 `mewly.` 접두어.
- 프레임 컴포넌트: SheetFrame(바텀 시트) + ModalFrame(중앙 모달) + OverlayFrame(풀스크린).
- i18n: 시안 KO/EN을 messages.js에 이식, 화면 개편으로 불용이 된 키는 제거. 시안의 고정 시드 데이터(콩이 등)는 이후 정리(seedPurged 1회 정리 플래그).

## 확정 방침

- 신규 기능 5종(일정·프로필·알림·알림 설정·조명/온도/마이크)은 **형태만** 구현 — babycat 미지원 ∴ composable 내부를 localStorage로 구동, 인터페이스 도출 후 내부만 교체. (이후 프로필은 `/client/storage/pet_profile`로 서버 이전, localStorage는 호스트별 캐시로 격하.)
- 기존 기능(라이브·클립·설정·인증)은 babycat 연결 유지한 채 재배치. 디자인 토큰은 현행 global.css와 동일. Wally2 참조 금지.

## 시안 구조 (tmp/design/Mewly.dc.html, 1988행)

- 골격: 하단 탭 4개 — 홈(house) · 일정(calendar-blank) · 분석(chart-bar, 시안의 기록 탭 승계) · 설정(gear). 활성 = ph-fill + accent + 800.
- 계층: 헤더(58px) / 풀스크린 오버레이(알림·프로필·알림 설정·일정 편집) / 바텀 시트(마이크·온도·조명·PTZ) / 중앙 모달(비밀번호·카메라·프롬프트·리소스·서버·세션 만료) / 회전 전체화면(라이브+로그 패널, 클립) / 토스트.

## 화면별 대응 (요지)

|시안|구현|
|---|---|
|로그인|LoginView 재스킨(중앙 정렬, 알약 버튼, 좌측 accent 보더 오류 박스)|
|홈|HomeTab — 영상 16:9 + 기기 4버튼 + VLM 카드(아코디언) + 요약 대시보드(프로필·오늘 일정·오늘 이벤트)|
|기록 → 분석|AnalysisTab으로 병합 — 날짜 이동 + 상태/이벤트 세그먼트 + 키워드 24시간 히트맵 + 그날의 클립(드릴다운·선택 삭제·10개 페이지네이션). 기록 탭 제거|
|일정·편집|CalendarTab(42셀 달력 + 점) + ScheduleEditor(카테고리 칩 6종, 종일 토글, 30분 단위, 알람 10종, 반복 5종, 검증 3종). useSchedules(localStorage)|
|설정|SettingsTab — 프로필 카드 + 그룹1(알림·카메라·프롬프트·분석·리소스·언어·테마) + 그룹2(비밀번호·서버·로그아웃)|
|알림·알림 설정·프로필|신규 오버레이 3종. useNotifications/useNotifSettings(localStorage), useProfile(서버 원본)|
|마이크·온도·조명|신규 시트 3종, useDevices(localStorage 목업, 프리셋 숫자 4슬롯)|
|PTZ|PtzSheet 재스킨 — 원형 패드+노브, 팬/틸트 절대 이동 게이지, 속도 2단, 프리셋 4슬롯, 자동 순찰(FR-052, SSE가 진실)|
|전체화면|회전 캔버스(100vh×100vw) + 우측 로그 패널 + PTZ 패드(항상 표시, 비활성 흐림)|

## 진행 기록 (전 단계 완료)

0(시안 전문 판독·대응표) → 1a(i18n) → 1b(4탭 골격) → 1c(홈) → 1d(기록 탭, 이후 분석 탭으로 병합) → 1e(설정+중앙 모달화) → 1f(로그인·전체화면 재스킨) → 2a(프로필) → 2b(일정) → 2c(알림) → 2d(알림 설정) → 3(기기 시트 3종+PTZ 재스킨) → 4(i18n 대조·빌드 통과).

## 시안 준거 원칙 (2026-08-18 사용자 확정)

시안은 답안지다 — 요소의 존재·배치·형태·문구는 dc.html과 1:1, 차이는 사용자 지시로만. 전수 대조 감사(약 25건)로 어긋남 전부 정정.

## 시안과의 차이 (전부 사용자 지시 또는 백엔드 제약)

- 사용자 지시: 홈 VLM 카드·로그는 babycat LiveMobile 형태, 컬러셋 토큰만 사용, 클립 플레이어 X 버튼, 달력 점 상단, 헤더 단일 프로토콜 토글·세션 칩 중앙, 페이지네이션, 로그인 세로모드 잠금, KeepAlive, PTZ 사전 비활성 등.
- 백엔드 제약(형태만 일치): PTZ 줌(값 표시만 — §12.4에서 범위 외 확정), 중앙 홈 버튼(이동 정지로 대체), 프리셋 좌표 표시(§12.3에서 좌표 필드 제거), 기기 제어 실패 토스트(목업이라 미발화).

## 검토(08-18) 반영 ·이후 변경

- 결함 수정: 전체화면 PTZ 정지 보장, 서버 주소 변경 시 해지 완료 후 적용, 날짜 로컬 해석 통일(dates.js), 클립 fetch 순서 보장, ModalFrame closable=false 배경 클릭 차단 등.
- 구조 정리: KeepAlive 탭 유지, OverlayFrame·controls.css 공용화, withDayHeaders 공용화.
- 이후 변경(08-25 확인): 기록 탭 제거·분석 탭 승계(상태=/summary, 이벤트=/events 집계), 알림 탭 분기(이상행동→분석, 일정→일정), 홈 요약 대시보드, 프로필 서버 이전.
