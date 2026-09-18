# iM-LocalBoost

상권·시간대별로 보너스율이 달라지는 지역화폐 결제 프로토타입입니다. 소비자가 가맹점에 mock iMKRW로 결제하면 컨트랙트가 온체인에 게시된 보너스율로 보너스 크레딧을 계산해 지급하고, 오프체인 엔진이 수요 예측으로 시간대별 율을 정하며 담합(파밍) 위험 등급을 EIP-712 서명으로 발급합니다. 위험 등급과 상한은 보너스만 줄이고 결제 자체는 막지 않습니다.

```
                 ┌──────────────────────────┐
                 │  web (Next.js, Vercel)    │  소비자 / 가맹점 / 대구시·은행 화면
                 │  페르소나 키로 직접 서명   │  (데모 전용, 브라우저 지갑 없음)
                 └──────┬───────────┬───────┘
          /attest, /rates│           │ payWithBoost, deposit, publish
                         ▼           ▼
   ┌──────────────────────────┐   ┌──────────────────────────────────────┐
   │ engine (FastAPI, Railway) │   │ Kaia Kairos (chainId 1001)            │
   │ · 이벤트 폴러 → SQLite    │◄──│ MockIMKRW · MerchantRegistry ·        │
   │ · 규칙 4종 + LightGBM 위험 │   │ LocalBoost (율·예산·상한·보류·환수)   │
   │ · 수요 예측 → 율 게시     │──►│ 보너스 금액은 컨트랙트만 계산          │
   │ · EIP-712 Attestation 서명│   └──────────────────────────────────────┘
   └──────────────────────────┘
                 ▲
   sim (Python)  │ 같은 규칙·율 계산으로 5개 시나리오 비교 → web/public/sim
```

## 배포

| 대상 | 링크 |
| --- | --- |
| 웹 | https://im-localboost-web.vercel.app (`/` 소비자, `/merchant` 가맹점, `/city` 대구시·은행) |
| 엔진 | https://engine-production-1edd.up.railway.app/health |
| MockIMKRW | https://kairos.kaiascan.io/address/0xCE53923831A766a03419c36ef6F08eAF33Cd9A6D |
| MerchantRegistry | https://kairos.kaiascan.io/address/0x8bAfE729E4f16FC54F26E3E412E83BF008eFF1aD |
| LocalBoost | https://kairos.kaiascan.io/address/0x70c55cb306cc42aA5b48f5936Ac7F7FE9d3419Bd |

배포 절차와 검증 기록은 `docs/deploy-kairos.md`, `docs/deploy-railway.md`, `docs/deploy-vercel.md`에 있습니다. Kairos 배포에서는 보류 지연 60초가 실제 시간이고, 공개 RPC라 트랜잭션 확인에 몇 초씩 걸립니다.

## 로컬 실행

Node 20+, Python 3.11, Docker(선택)가 필요합니다. 터미널을 세 개 씁니다.

```
make setup          # contracts/web npm install, 루트 .venv, .env·web/.env.local 복사
make node           # [터미널 1] Hardhat 로컬 노드 (chainId 31337)
make deploy-local   # 배포 + 시드, shared/deployments.json·abi 갱신
make train          # 합성 데이터 생성 → 위험 모델·수요 모델 학습 (지표는 나온 그대로 출력)
make engine         # [터미널 2] uvicorn engine.main:app (기본 8000)
make web            # [터미널 3] next dev (기본 3000)
```

로컬은 Hardhat 기본 계정을 씁니다(#0 deployer, #1 city, #2 bank, #3 oracle, #4 attester, #5~#9 소비자 1~5, #10~#12 가맹점 1~3). 비밀값은 `.env`에만 둡니다.

## 데모 순서

웹 상단의 페르소나 전환기로 계정을 고르면 그 역할의 화면으로 이동합니다. 각 단계의 프로덕션 스크린샷은 `docs/demo/prod-step1.png` ~ `prod-step5.png`이며, 2026-09-18 UI 재설계 이전 화면으로 찍은 것이라 배치와 색은 현재 배포와 다릅니다. 단계와 기대 결과는 같습니다.

| 단계 | 페르소나 | 화면 | 하는 일 | 기대 결과 | 스크린샷 |
| --- | --- | --- | --- | --- | --- |
| 1 | 대구시 | `/city` | 북성로에 예산 예치(500,000원) → "율 게시" (데모 전용: 북성로 10% 고정 토글 켬) | 북성로 카드와 `/` 약도에 10.0% | [step1](docs/demo/prod-step1.png) |
| 2 | 소비자 1 | `/` | 북성로 한식당에 10,000원 결제 | "지급", 보너스 1,000원, 크레딧 1,000원, 가맹점 +10,000원, tier 0 | [step2](docs/demo/prod-step2.png) |
| 3 | 소비자 1 | `/` | 같은 가게에 다시 결제 | 성공, 보너스 0원, 사유 "오늘 이미 보너스를 받은 가게" | [step3](docs/demo/prod-step3.png) |
| 4 | 대구시 → 은행 | `/city` | "담합 링 실행" (가맹점 2가 소비자 2~5에게 9,000원 환류 후 각자 결제) | 위험 로그에 tier ≥ 1과 "환류". tier 1 건은 보류 목록에 생기고 은행 페르소나의 "환수"로 예산 복원. tier 2 건은 보너스 0원으로 즉시 차단 | [step4](docs/demo/prod-step4.png) |
| 5 | 대구시 | `/city` | "서명 재사용 공격" (직전 서명을 같은 인자로 재제출) | "이미 사용된 서명입니다 (재사용 차단)" `NonceUsed` | [step5](docs/demo/prod-step5.png) |
| 6 | 대구시 | `/city` | 하단 "시뮬레이션" | `make sim` 결과 차트 | - |

알아 둘 점:

- 4단계는 프로덕션 실행에서 소비자 2~5가 전부 **tier 2**(환류 규칙 + 모델 점수 0.947~0.989)로 즉시 차단되었고 보류는 생기지 않았습니다. 최종 등급은 규칙과 모델 중 큰 값이며, 학습된 모델이 "신규 지갑 + 환류 + 직후 결제"를 0.9 이상으로 평가하기 때문입니다. 보류(tier 1) → 환수 흐름만 따로 보려면 attester 키로 tier 1 서명을 만들어 결제하는 스크립트를 씁니다: `cd contracts && PAYER=2 MERCHANT=1 AMOUNT=10000 TIER=1 npx hardhat run scripts/demo-pay.ts --network localhost`.
- 5단계는 보관된 서명이 없거나 유효 시간(120초)이 30초 미만 남았으면 소비자 1이 1,000원 결제를 먼저 한 뒤 그 서명을 재제출하므로 언제 눌러도 `NonceUsed`가 나옵니다.
- 데모는 시드 직후 상태(북성로 예산 0, 오늘 결제 없음)를 전제합니다. 하루 경계는 KST입니다. 다시 하려면 `make deploy-local`(로컬) 또는 `make deploy-kairos` 후 엔진·웹 재배포(Kairos)를 합니다.
- 브라우저 없이 같은 순서를 검증: `cd web && npx tsx --env-file=.env.local scripts/demo-e2e.ts` (Kairos: `ENV_FILE=.env.kairos ENGINE_URL=<엔진 URL> npx tsx scripts/demo-e2e.ts`). `make test-integration`도 소비자 1의 결제를 남기므로, 통합 테스트와 데모(브라우저·e2e)는 각각 새 시드에서 시작하세요.

## 테스트

```
make test              # contracts: Hardhat 테스트 (SPEC 4.4의 17개 케이스 포함) + engine: pytest (통합 제외)
make test-integration  # 노드·엔진이 떠 있는 상태에서 엔진 서명 → 온체인 결제 → 재사용 revert 확인
```

## 시뮬레이션

```
make sim   # sim/run.py --seed 7 --days 28 --consumers 5000 → sim/out/, web/public/sim/
```

소비자 5,000명, 상권 5개, 하루 14슬롯, 28일. 다항 로짓 `U = pref[z] - travel_cost[z] + sensitivity * benefit_rate[z,t]`에 "소비 안 함" 선택지를 포함합니다. 시나리오는 `none`(혜택 없음), `A`(일률 10%), `B`(동적 율, A와 총예산이 같도록 k 보정), `C_on`/`C_off`(B + 담합 링, 방어 켬/끔)입니다.

지표 정의 (`results.json.definitions` 그대로):

| 지표 | 정의 |
| --- | --- |
| `vulnerable_slot_sales_uplift` | 상권별로 `none` 매출 하위 25% (일, 슬롯) 셀에서 `(scenario - none) / none` |
| `net_sales_per_won` | `(total_sales - none.total_sales) / total_boost` |
| `deadweight_ratio` | `none`에서도 같은 상권·(일, 슬롯)에 구매했을 소비자에게 지급된 보너스 / total_boost |
| `farming_leakage` | 링 결제에 지급되고 회수되지 않은 보너스 / total_boost (C 시나리오) |
| `detection_precision` / `detection_recall` | C_on에서 규칙 tier ≥ 1 판정의 링 라벨 대비 정밀도 / 재현율 (전체 결제) |

결과 (`web/public/sim/results.json`, seed 7, 생성 2026-09-18T08:24:36+00:00, 수치를 고치지 않음):

| 시나리오 | 취약 슬롯 매출 증가율 | 예산 1원당 순증 매출 | 사중 손실 비율 | 파밍 누수율 | 탐지 정밀도 | 탐지 재현율 | 총매출 | 총 보너스 | k |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| none | 0.000 | - | - | - | - | - | 3,636,417,000 | 0 | - |
| A | 0.173 | 1.547 | 0.869 | - | - | - | 4,178,929,000 | 350,721,035 | - |
| B | 0.185 | 1.578 | 0.852 | - | - | - | 4,170,723,000 | 338,564,644 | 1.5 |
| C_on | 0.185 | 1.618 | 0.851 | 0.001 | 0.040 | 0.635 | 4,179,446,000 | 335,594,003 | 1.5 |
| C_off | 0.185 | 1.602 | 0.851 | 0.001 | - | - | 4,179,446,000 | 338,977,980 | 1.5 |

읽는 법: 동적 율(B)은 일률 10%(A)보다 취약 슬롯 매출을 조금 더 올리고 사중 손실을 조금 줄였습니다. 방어를 켠 C_on의 탐지 정밀도 0.040은 규칙 계층만의 수치이며(모델 미포함), 정상 결제 가운데 환류·쌍 반복 규칙에 걸리는 오탐이 많다는 뜻입니다. 이 값을 조정하지 않았습니다.

학습 지표(`make train` 출력, `engine/models/*_metrics.json`): 위험 모델 validation precision@0.5 1.000, recall@0.5 0.911, AUC 1.000 (합성 데이터라 과대평가될 수 있음). 수요 모델 validation MAE 48,458원, 8~21시 MAPE 0.589.

## 설계 요약

**불변식 5개** (컨트랙트·엔진·웹이 모두 지킴):

1. 결제는 위험 등급이나 상한 때문에 revert하지 않는다. 줄어드는 것은 보너스뿐이다. revert 사유는 서명 불일치·만료·nonce 재사용·비활성 가맹점·미등록 결제자·잔액/allowance 부족뿐이다.
2. 보너스 금액은 컨트랙트만 계산한다. 서명에는 등급만 있고 금액·율이 없다.
3. 모든 개인 상한은 주소가 아니라 `personId` 단위다.
4. 크레딧으로 낸 금액에는 보너스가 붙지 않는다.
5. 회계 등식 `iMKRW.balanceOf(LocalBoost) == Σ zoneBudget + Σ credit + Σ pending(미처리)`가 모든 상태 변경 뒤에 성립한다.

**보너스 계산 순서** (`payWithBoost`, 어느 단계에서 0이 되어도 revert하지 않음):

1. `pairDay[personId][merchant] == 오늘`이면 보너스 0 (하루에 같은 가게 한 번)
2. 슬롯 상한: `base = min(amount - useCredit, slotBaseline × slotCapBps / 10000 - slotVolume[merchant][hour])`
3. `boost = base × rate[zone][hour] / 10000`
4. `boost = min(boost, 건당 상한, 1인 일일 상한 잔여, 상권 시간당 상한 잔여, 상권 예산)`
5. tier 2 → 0. tier 0 → 크레딧 즉시 적립. tier 1 → 보류(`pendingDelay` 후 지급, 은행이 환수 가능)

**위험 판정** (엔진 `/attest`, 최종 tier = max(규칙, 모델)):

| 규칙 | 조건 | tier |
| --- | --- | --- |
| 환류 `backflow` | 최근 24시간 Transfer 그래프에서 가맹점 → 결제자 경로가 3홉 이내 | 1 |
| 쌍 반복 `pair_repeat` | 같은 결제자·가맹점 쌍의 최근 7일 보너스 결제 ≥ 4회 | 1 |
| 신규 지갑 군집 `new_wallet_cluster` | 등록 48시간 이내 지갑 ≥ 5개가 같은 가맹점에 1시간 내 결제 | 2 |
| 매출 이탈 `sales_spike` | 가맹점 현재 슬롯 매출 > 기준 × 3 | 1 |

모델 계층은 LightGBM 이진 분류기(피처 11개, 학습·서빙이 같은 `engine/features.py`)이며 `score < 0.5 → 0`, `0.5~0.8 → 1`, `≥ 0.8 → 2`입니다.

**율 계산** (엔진 `/rates/publish`, zone × 1시간): LightGBM 회귀로 `predictedSales`, `baseline` = 같은 슬롯 최근 8주 상위 25% 평균, `slack = max(0, 1 - predictedSales / baseline)`, `bps = clip(round_to_50(k × slack × vulnerability[zone] × 10000), 0, 1500)`. `k`는 하루 한 번 `clamp(planned_spend / actual_spend, 0.5, 1.5)`로 보정하고, 슬롯의 10%는 `{0, 500, 1000, 1500}` 탐색값을 씁니다(overrides가 있는 상권 제외). 상한은 온체인 `caps().maxRateBps`를 읽어 적용하므로 대구시가 최대 율을 낮춰도 게시가 `RateTooHigh`로 막히지 않습니다. 한 번 게시한 뒤에는 엔진 폴러가 정시마다 마지막 overrides로 현재·다음 시간을 자동 재게시합니다.

금액은 전부 원 단위 정수(토큰 소수점 0)이고, 하루 경계는 KST(`(timestamp + 9h) / 1 day`)입니다.

## 하지 않은 것과 데모 전용 장치

하지 않은 것: 영수증 OCR·LLM 호출, 실제 iMKRW 연동, 실데이터, KYC, 모바일 앱, 지도 API, Kaia 수수료 대납, 프라이버시 계층, 운영용 키 관리, 다중서명 거버넌스. 외부 유료 API를 쓰지 않습니다.

데모 전용 장치 (프로덕트 설계의 일부가 아님):

- **고정 율 override**: `/city`의 "데모 전용: 북성로 10% 고정" 토글은 `/rates/publish`에 `overrides: {"4": 1000}`을 보냅니다. 엔진이 계산한 다른 상권 율은 그대로 게시됩니다.
- **브라우저 개인키**: 페르소나 키가 `NEXT_PUBLIC_*`로 번들에 들어갑니다. 로컬은 Hardhat 공개 계정, Kairos는 테스트넷 전용 일회용 키입니다. 실제 자산이 있는 키를 절대 넣지 마세요.
- **담합 링 / 서명 재사용 버튼**: `/city` 하단 "데모 보조". 링은 가맹점 2 → 소비자 2~5 환류 후 결제를 순서대로 실행하고, 재사용은 소비자 화면의 직전 서명을 재제출합니다.

## 알려진 제약

- 시드 직후에는 모든 지갑이 "신규"라서 담합 링의 다섯 번째 결제는 신규 지갑 군집 규칙만으로도 tier 2가 됩니다. 프로덕션 실행에서는 모델 점수 때문에 2~5번째 전부 tier 2였습니다.
- Kairos 공개 RPC는 트랜잭션 확인이 수 초씩 걸리고 엔진 폴러가 새 배포를 따라잡는 데 시간이 걸릴 수 있습니다. `/health`의 `lastBlock`이 오르는지 확인하세요.
- 서명 유효 시간은 120초입니다. 소비자 화면에서 만료된 서명으로 결제하면 `AttestationExpired`가 납니다 (데모 5단계 버튼은 새 결제를 먼저 만들어 이를 피합니다).
- 위험 모델·수요 모델은 합성 데이터로 학습했으므로 지표가 실데이터를 대표하지 않습니다.
