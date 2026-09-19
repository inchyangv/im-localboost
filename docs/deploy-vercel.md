# Vercel 웹 배포 기록

- 프로젝트: `im-localboost-web` (팀 `studio-liq`)
- 웹 URL: https://im-localboost-web.vercel.app
  - `/` 소비자, `/merchant` 가맹점, `/city` 대구시·은행
- 엔진: https://engine-production-1edd.up.railway.app (`docs/deploy-railway.md`)
- 체인: Kaia Kairos (chainId 1001), 컨트랙트 주소는 `shared/deployments.json["1001"]` (`docs/deploy-kairos.md`)

## 배포 방식

로컬에서 빌드하여 산출물만 올린다. Vercel 프로젝트에는 환경 변수를 등록하지 않는다.

```
make web-prod-env ENGINE_URL=https://engine-production-1edd.up.railway.app ENV_FILE=.env.kairos   # web/.env.production.local 생성
make deploy-web   ENGINE_URL=https://engine-production-1edd.up.railway.app ENV_FILE=.env.kairos   # 위 단계 + vercel build --prod + vercel deploy --prebuilt --prod
```

처음 한 번은 `web/`에서 `vercel project add im-localboost-web` → `vercel link --yes --project im-localboost-web`을 실행한다. `web/.vercel/`은 gitignore 대상이다.

컨트랙트를 다시 배포하면(`make deploy-kairos`) `shared/deployments.json`이 바뀌므로 Railway(`railway up --service engine --ci`)와 웹(`make deploy-web …`)을 둘 다 다시 올려야 한다.

## 번들에 들어가는 변수 (이름만)

`NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_ENGINE_URL`, `NEXT_PUBLIC_EXPLORER_URL`, `NEXT_PUBLIC_PAYER_KEYS`, `NEXT_PUBLIC_MERCHANT_KEYS`, `NEXT_PUBLIC_CITY_KEY`, `NEXT_PUBLIC_BANK_KEY`

**경고: 이 키들은 Kairos 테스트넷 전용 일회용 키이며 브라우저 번들에 그대로 노출된다.** 실제 자산이 있는 키를 절대 넣지 않는다. 데모 전용 장치이며 `web/scripts/write-prod-env.mjs` 상단 주석에도 같은 내용이 있다.

## 배포 중 고친 것

- `web/vercel.json`에 `framework: nextjs`를 명시했다. `vercel project add`로 만든 프로젝트는 프레임워크가 "Other"라서 `vercel build`가 Next.js를 건너뛰고 정적 파일만 올렸다.
- `web/next.config.js`의 `outputFileTracingRoot`를 `VERCEL` 환경에서는 끈다. `@vercel/next`가 추적 루트를 한 번 더 붙여 `web/web/.next`를 찾다 실패했다. 세 페이지 모두 정적 프리렌더링이라 런타임 추적이 필요 없다.
- `web/src/components/city/BudgetAndRates.tsx` 예치 금액 입력의 `step`을 10000 → 1로 바꿨다. `min=1`과 `step=10000` 조합에서 브라우저 검증이 500,000을 거부해 예치가 불가능했다.
- Makefile `deploy-web`은 `npx vercel` 대신 전역 `vercel`을 쓴다 (npx가 캐시된 다른 버전을 가져왔다).

## 검증 (2026-09-18, Vercel + Railway + Kairos)

- `/`, `/city`, `/merchant` 모두 200. 번들 청크에 엔진 URL·탐색기 URL·chainId 1001·DalgubeolPay 주소가 포함됨
- SPEC 11절 1~5단계를 브라우저에서 통과. 당시 스크린샷 `prod-step1~5.png`는 재설계 뒤 `docs/demo/*.png`로 교체
  1. 북성로 500,000원 예치 → 율 게시 → 북성로 10.0%
  2. 소비자 1 → 북성로 한식당 10,000원: 보너스 1,000원, 크레딧 1,000원, tier 0
  3. 같은 가게 재결제: 성공, 보너스 0원, 사유 "오늘 이미 보너스를 받은 가게"
  4. 담합 링: 소비자 2~5 전부 tier 2(환류 + 모델 점수 0.947~0.989)로 즉시 차단, 보류 0건. SPEC 11절이 신규 지갑에서 기본이라고 적은 경우이며 보류→환수 경로는 이번 실행에서 나오지 않았다
  5. 서명 재사용: `NonceUsed` revert 표시. 참고로 마지막 서명 후 120초(`DEADLINE_SECONDS`)가 지나면 `AttestationExpired`가 먼저 걸리므로 데모에서는 결제 직후에 눌러야 한다
- 브라우저 콘솔에 CORS 오류 없음. `OPTIONS /attest` (Origin `https://im-localboost-web.vercel.app`)에 `access-control-allow-origin` 헤더 확인. Railway `WEB_ORIGIN`도 웹 URL로 갱신

## 재배포 (2026-09-18, 웹 UI 재설계)

- 커밋 `4c49052` (feat(web): redesign UI with a Toss/iM Bank-inspired design system)를 같은 절차(`make deploy-web ENGINE_URL=https://engine-production-1edd.up.railway.app ENV_FILE=.env.kairos`)로 올렸다. 배포 `dpl_EEAKuzQ5gHnF7CvWzs5tUa4boMQe`, 별칭 https://im-localboost-web.vercel.app
- 엔진·컨트랙트는 바꾸지 않았으므로 Railway와 Kairos는 그대로다
- 확인: `/`, `/merchant`, `/city` 200. 소비자 페이지 청크에 새 UI 문구와 엔진 URL 포함. 브라우저에서 상단 "엔진 연결됨 | Kaia Kairos", 상권 카드가 온체인 값(북성로 10.0%, 예산 499,000원)을 표시. Pretendard는 jsDelivr CDN에서 로드되며 실패 시 시스템 한글 글꼴로 대체된다
- 현재 UI 스크린샷은 `docs/demo/*.png`(2026-09-19, 프로덕션 데이터)다. 재설계 이전의 `prod-step*.png`는 지웠다. 단계와 기대 결과는 README 표와 같다
