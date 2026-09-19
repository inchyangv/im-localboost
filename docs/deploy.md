# 배포

프로덕션은 세 곳으로 구성됩니다. 컨트랙트는 Kaia Kairos 테스트넷에, 엔진은 Railway에, 웹은 Vercel에 있습니다.

| 구성 | 위치 | 주소 |
| --- | --- | --- |
| 컨트랙트 | Kaia Kairos (chainId 1001) | 아래 [컨트랙트](#컨트랙트) 표 |
| 엔진 | Railway `im-localboost` / `engine` / `production` | https://engine-production-1edd.up.railway.app ([`/health`](https://engine-production-1edd.up.railway.app/health)) |
| 웹 | Vercel `im-localboost-web` | https://im-localboost-web.vercel.app |

## 재배포 순서

컨트랙트를 다시 배포하면 `shared/deployments.json`의 주소가 바뀝니다. 엔진과 웹이 모두 이 파일을 이미지와 번들에 포함하므로 아래 세 단계를 순서대로 전부 실행해야 합니다.

```
make deploy-kairos                       # 1. check-funds → fund → deploy → seed → write-shared
railway up --service engine --ci         # 2. 엔진 재배포 (업로드 → 빌드 → 배포, 약 4분)
make deploy-web ENGINE_URL=https://engine-production-1edd.up.railway.app ENV_FILE=.env.kairos   # 3. 웹
```

웹이나 엔진의 코드만 바꿨다면 해당 단계만 실행합니다. 엔진은 가맹점 목록을 온체인 등록부에서 읽으므로, 가맹점만 추가한 경우(`contracts/scripts/register-merchants.ts`, 멱등)에는 엔진을 다시 배포할 필요가 없습니다.

> **주의**: `make deploy-web`을 인자 없이 실행하면 `ENV_FILE=.env`(로컬 Hardhat 키, 로컬 엔진 URL)를 읽어서 `web/.env.production.local`을 로컬 값으로 덮어씁니다. `NEXT_PUBLIC_*` 값은 빌드할 때 번들에 고정되므로, 이 상태로 배포하면 `127.0.0.1`을 바라보는 사이트가 그대로 올라갑니다. 항상 위와 같이 `ENGINE_URL`과 `ENV_FILE`을 함께 넘기세요.

## Kairos (컨트랙트)

- RPC `https://public-en-kairos.node.kaia.io`, 탐색기 https://kairos.kaiascan.io
- 배포 블록: 228099395 (`shared/deployments.json["1001"].startBlock`). 엔진 폴러는 이 블록부터 이벤트를 읽습니다.
- 키는 `.env.kairos`에만 있으며 저장소에 넣지 않습니다. `make kairos-keys`가 테스트넷 키 13개를 만들고 이미 있으면 건너뜁니다.

### 컨트랙트

| 이름 | 주소 |
| --- | --- |
| MockIMKRW | [`0x0618ba0D361C5107bE2E39901dd394BFC4092A4b`](https://kairos.kaiascan.io/address/0x0618ba0D361C5107bE2E39901dd394BFC4092A4b) |
| MerchantRegistry | [`0xEB0aFb837B488e9713a825299F4DF6BB6D32Cc41`](https://kairos.kaiascan.io/address/0xEB0aFb837B488e9713a825299F4DF6BB6D32Cc41) |
| DalgubeolPay | [`0x7ef0DA4bd695E91eAe9d53fb1Df18F302585258d`](https://kairos.kaiascan.io/address/0x7ef0DA4bd695E91eAe9d53fb1Df18F302585258d) |

### 역할별 주소

| 역할 | 주소 | 비고 |
| --- | --- | --- |
| deployer (DEFAULT_ADMIN_ROLE, MINTER_ROLE) | `0x1999e0a0769A3eb63CB1f6ed7Ad01e8022d94d63` | 웹 번들에 넣지 않습니다 |
| city (CITY_ROLE) | `0x0EDcd61eaF9d3232D8a0bd846c82Fb85A6f02Ca2` | 데모 계정 "대구시" |
| bank (BANK_ROLE, MockIMKRW MINTER_ROLE) | `0x96179CD97Ecb3d6FEF2a9B7984364F7F7B71F6D8` | 데모 계정 "은행". 엔진도 이 키로 `/onboard`를 서명하므로 KAIA 잔액이 필요합니다 |
| oracle (ORACLE_ROLE) | `0x4dE4788bB46F8301E85f42CDe38D64c54b729755` | 엔진 전용. 율을 게시할 때 가스를 씁니다 |
| attester | `0x5e71c4A130EF1d64158427489494204EFF1e2555` | 엔진 전용. 오프체인 서명만 하므로 가스가 필요 없습니다 |
| payer 1~5 | `0xB2843980532B3F83eC96D7876cF62aBa5f351E17`, `0xcd531e7C224f6be46B931b987c65cf3d841ca9b8`, `0xe1F4977a577fE55A23ba47f241f259AA6099AD1B`, `0x4B594e2C85015FC3Fb061C3bDffd3Cf9495fD040`, `0xeF764074937320C8b912cE6dB4dBf0eF8B4c89b7` | 담합 링 등 데모 보조 기능이 씁니다 |
| merchant 1 (북성로 한식당) | `0x5b29D2Cb77C81D67E16D6ab57c9b8D4b74E851cE` | 데모 계정 "가맹점 1" |
| merchant 2 (들안길 카페) | `0x6BBbC596887E0DED9F5BfAb41592e6A54999259D` | 데모 계정 "가맹점 2" |
| merchant 3 (서문시장 소매) | `0x3df23b5F7531D55540ECF53b8cf61E42E7a65106` | 데모 계정 "가맹점 3" |

나머지 가맹점(총 200곳)은 deployer에서 파생한 수취 전용 주소로 등록되어 있습니다. 시민은 이 가게들에 결제할 수 있지만 가맹점 데스크에 로그인할 데모 계정은 없습니다.

### 가스

- deployer가 payer 1~5와 merchant 1~3에 0.5 KAIA씩 분배했습니다(`contracts/scripts/fund.ts`, 잔액이 0.3 KAIA 이상이면 건너뜀).
- 결제 1건의 가스비는 약 0.005 KAIA입니다.
- 은행과 오라클 계정의 잔액은 `/admin/bank`의 "운영 계정 가스" 카드에서 확인합니다. Kairos faucet은 캡차가 있어서 운영자가 직접 받아야 합니다.

### Kairos 상대로 통합 테스트 실행

```
ENV_FILE=.env.kairos PORT=8011 make engine           # Kairos용 엔진을 로컬에서 실행
ENV_FILE=.env.kairos CHAIN_ID=1001 ENGINE_URL=http://127.0.0.1:8011 .venv/bin/pytest -m integration -s
```

## Railway (엔진)

- 빌드: `engine/Dockerfile`, 빌드 컨텍스트는 저장소 루트입니다. 합성 데이터 생성과 모델 학습이 이미지 빌드 단계에서 실행되므로 모델이 이미지에 포함됩니다.
- 볼륨: `engine-volume`을 `/data`에 마운트합니다. SQLite(`DB_PATH=/data/engine.db`)가 재배포 뒤에도 유지됩니다.

### 서비스 변수 (이름만 기록)

| 이름 | 설명 |
| --- | --- |
| `RPC_URL`, `CHAIN_ID` | Kairos 공개 RPC, `1001` |
| `DB_PATH` | `/data/engine.db` |
| `WEB_ORIGIN` | CORS 허용 오리진. 웹 URL과 같아야 합니다 |
| `ORACLE_KEY` | 율 게시용 키 |
| `ATTESTER_KEY` | 결제 서명용 키 |
| `BANK_KEY` | 지갑 온보딩용 키 (`POST /onboard`: setPerson, iMKRW 발행, 가스 전송) |
| `ONBOARD_IMKRW`, `ONBOARD_GAS_KAIA` | 선택. 기본값은 100000원, 0.2 KAIA |
| `RAILWAY_DOCKERFILE_PATH` | `engine/Dockerfile` |

키는 stdin으로만 입력했고 로그나 명령 인자에 남기지 않았습니다.

### 명령

```
railway status --json                                 # 링크된 프로젝트·서비스 확인
railway up --service engine --ci                      # 재배포 (로그 스트리밍)
railway redeploy --service engine -y                  # 마지막 이미지로 재시작
railway logs --service engine                         # 런타임 로그
railway variable list --service engine --json         # 변수 확인 (값이 포함되므로 출력을 공유하지 않음)
echo -n "<value>" | railway variable set KEY --stdin --service engine --skip-deploys
```

### 겪은 문제

- Railway CLI 5.47에서는 `railway.json`의 빌더 설정이 무시되고 railpack 자동 감지로 넘어갑니다. `RAILWAY_DOCKERFILE_PATH` 변수로 Dockerfile을 지정해서 해결했습니다.
- `railway volume add`는 `--service`와 `--environment`에 이름이 아니라 ID를 넘겨야 동작합니다. 이름을 넘기면 CLI가 panic합니다.

## Vercel (웹)

로컬에서 빌드하고 산출물만 올립니다. `web/`이 `../shared`를 읽기 때문이며 Vercel 프로젝트에는 환경 변수를 등록하지 않습니다.

```
make web-prod-env ENGINE_URL=... ENV_FILE=.env.kairos   # web/.env.production.local 생성
make deploy-web   ENGINE_URL=... ENV_FILE=.env.kairos   # 위 단계 + vercel build --prod + vercel deploy --prebuilt --prod
```

처음 한 번은 `web/`에서 `vercel project add im-localboost-web` → `vercel link --yes --project im-localboost-web`을 실행합니다. `web/.vercel/`은 gitignore 대상입니다.

### 번들에 들어가는 변수 (이름만 기록)

`NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_ENGINE_URL`, `NEXT_PUBLIC_EXPLORER_URL`, `NEXT_PUBLIC_PAYER_KEYS`, `NEXT_PUBLIC_MERCHANT_KEYS`, `NEXT_PUBLIC_CITY_KEY`, `NEXT_PUBLIC_BANK_KEY`

> **경고**: 위 키들은 Kairos 테스트넷 전용 일회용 키이며 브라우저 번들에 그대로 노출됩니다. 관리자 도구의 데모 계정을 위한 데모 전용 장치입니다. 실제 자산이 있는 키를 절대 넣지 마세요. `web/scripts/write-prod-env.mjs` 상단 주석에도 같은 내용이 있습니다.

### 배포 전후 확인

1. 배포 전에 `web/.vercel/output/static`에서 Railway 호스트를 grep하면 결과가 나와야 하고 `127.0.0.1`을 grep하면 결과가 없어야 합니다.
2. 배포 후에 `vercel inspect <url>`이 `target production`과 별칭 `im-localboost-web.vercel.app`을 보여 주는지 확인합니다.
3. 사이트를 열어서 콘솔 오류와 실패한 요청이 없는지, 상단에 "엔진 연결됨"이 표시되는지 확인합니다.

### 겪은 문제

- `vercel project add`로 만든 프로젝트는 프레임워크가 "Other"로 잡혀서 `vercel build`가 Next.js 빌드를 건너뛰고 정적 파일만 올렸습니다. `web/vercel.json`에 `framework: nextjs`를 명시했습니다.
- `@vercel/next`가 추적 루트를 한 번 더 붙여서 `web/web/.next`를 찾다가 실패했습니다. `web/next.config.js`의 `outputFileTracingRoot`를 `VERCEL` 환경에서는 끕니다.
- `npx vercel`이 캐시된 다른 버전을 가져와서, Makefile은 전역 `vercel`을 씁니다.

## 검증 기록

| 날짜 | 대상 | 확인한 것 |
| --- | --- | --- |
| 2026-09-18 | 엔진 | `/health`가 `ok: true`, `chainId: 1001`, `model: true`를 반환하고 `contract`가 `shared/deployments.json`의 DalgubeolPay와 일치합니다. 30초 간격으로 두 번 호출했을 때 `lastBlock`이 228092357에서 228092388로 증가했습니다. |
| 2026-09-18 | 엔진 | `POST /rates/publish {"overrides":{"4":1000}}`가 txHash를 반환했고 Kairos에서 `currentRate(4) == 1000`이었습니다. `railway redeploy` 뒤에도 `/payments` 기록이 유지됐습니다. |
| 2026-09-18 | 웹 + 엔진 + Kairos | 브라우저에서 다섯 단계를 통과했습니다. ① 북성로 500,000원 예치 → 율 게시 → 10.0% ② 소비자 1이 북성로 한식당에 10,000원 결제, 보너스 1,000원, tier 0 ③ 같은 가게 재결제는 성공하고 보너스 0원 ④ 담합 링의 소비자 2~5가 전부 tier 2(환류 + 모델 점수 0.947~0.989)로 즉시 차단, 보류 0건 ⑤ 서명 재사용은 `NonceUsed` revert |
| 2026-09-18 | CORS | 브라우저 콘솔에 CORS 오류가 없고 `OPTIONS /attest`(Origin은 웹 URL)에 `access-control-allow-origin` 헤더가 있습니다. |
| 2026-09-19 | 웹 | 소비자 앱과 관리자 도구를 분리한 뒤 다시 배포했습니다. `docs/demo/*.png`는 이날 프로덕션 데이터로 찍은 화면입니다. |

### 배포 이력

- 첫 배포(블록 228091986, DalgubeolPay `0xFc38…B440`): 통합 테스트로 첫 `Paid`(`0xc7d8bf8b…b94f`)를 남겼습니다. 같은 KST 날에 데모 전제(오늘 결제 없음)를 맞추려고 재배포했습니다.
- 두 번째 배포: 웹 데모로 첫 결제가 발생했습니다(소비자 1 → 북성로 한식당, 10,000원, 보너스 1,000원, tier 0). [트랜잭션 `0x94bf32b1…c5c1`](https://kairos.kaiascan.io/tx/0x94bf32b1a44e4179566366a69efd2c1effe400b0d7257f35056237af5eb1c5c1) (블록 228093098)
- 세 번째 배포(블록 228099395, 현재): 컨트랙트 이름과 EIP-712 도메인을 `DalgubeolPay`로 바꾸고 온보딩을 위해 bank에 MockIMKRW MINTER_ROLE을 부여했습니다.

이전 배포의 컨트랙트는 탐색기에 남아 있지만 사용하지 않습니다.
