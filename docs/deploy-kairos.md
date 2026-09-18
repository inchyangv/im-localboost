# Kaia Kairos 배포 기록

- 체인: Kaia Kairos 테스트넷 (chainId 1001), RPC `https://public-en-kairos.node.kaia.io`
- 탐색기: https://kairos.kaiascan.io
- 배포 블록: 228099395 (`shared/deployments.json["1001"].startBlock`)
- 배포 명령: `make deploy-kairos` (check-funds → fund → deploy → seed → write-shared)

## 컨트랙트

| 이름 | 주소 | 탐색기 |
| --- | --- | --- |
| MockIMKRW | `0x0618ba0D361C5107bE2E39901dd394BFC4092A4b` | https://kairos.kaiascan.io/address/0x0618ba0D361C5107bE2E39901dd394BFC4092A4b |
| MerchantRegistry | `0xEB0aFb837B488e9713a825299F4DF6BB6D32Cc41` | https://kairos.kaiascan.io/address/0xEB0aFb837B488e9713a825299F4DF6BB6D32Cc41 |
| DalgubeolPay | `0x7ef0DA4bd695E91eAe9d53fb1Df18F302585258d` | https://kairos.kaiascan.io/address/0x7ef0DA4bd695E91eAe9d53fb1Df18F302585258d |

## 첫 결제 (`Paid`)

- 2026-09-18 세 번째 배포(블록 228099395): 컨트랙트 이름·EIP-712 도메인이 `DalgubeolPay`로 바뀌고 bank에 MockIMKRW MINTER_ROLE이 부여됨(온보딩용). 아래 첫 결제 기록은 이전 배포 기준이며 새 배포의 첫 결제는 데모 리허설 때 갱신한다.

- Vercel 웹 데모 2단계(소비자 1 → 북성로 한식당, 10,000원, boost 1,000원, tier 0)로 발생.
- 트랜잭션: https://kairos.kaiascan.io/tx/0x94bf32b1a44e4179566366a69efd2c1effe400b0d7257f35056237af5eb1c5c1 (블록 228093098)
- 이력: 첫 배포(블록 228091986, DalgubeolPay 0xFc38…B440)에서는 통합 테스트로 첫 Paid `0xc7d8bf8b…b94f`를 남겼으나, 같은 KST 날에 데모 전제(오늘 결제 없음)를 맞추기 위해 재배포했다. 옛 컨트랙트는 탐색기에 남아 있지만 사용하지 않는다.

## 역할별 주소 (개인키는 `.env.kairos`에만 있으며 저장소에 넣지 않는다)

| 역할 | 주소 |
| --- | --- |
| deployer (DEFAULT_ADMIN_ROLE, MINTER_ROLE) | `0x1999e0a0769A3eb63CB1f6ed7Ad01e8022d94d63` |
| city (CITY_ROLE) | `0x0EDcd61eaF9d3232D8a0bd846c82Fb85A6f02Ca2` |
| bank | `0x96179CD97Ecb3d6FEF2a9B7984364F7F7B71F6D8` |
| oracle (ORACLE_ROLE) | `0x4dE4788bB46F8301E85f42CDe38D64c54b729755` |
| attester (오프체인 서명, 가스 불필요) | `0x5e71c4A130EF1d64158427489494204EFF1e2555` |
| payer 1 | `0xB2843980532B3F83eC96D7876cF62aBa5f351E17` |
| payer 2 | `0xcd531e7C224f6be46B931b987c65cf3d841ca9b8` |
| payer 3 | `0xe1F4977a577fE55A23ba47f241f259AA6099AD1B` |
| payer 4 | `0x4B594e2C85015FC3Fb061C3bDffd3Cf9495fD040` |
| payer 5 | `0xeF764074937320C8b912cE6dB4dBf0eF8B4c89b7` |
| merchant 1 (북성로 한식당) | `0x5b29D2Cb77C81D67E16D6ab57c9b8D4b74E851cE` |
| merchant 2 (들안길 카페) | `0x6BBbC596887E0DED9F5BfAb41592e6A54999259D` |
| merchant 3 (서문시장 소매) | `0x3df23b5F7531D55540ECF53b8cf61E42E7a65106` |

merchant 4~8은 시드 스크립트가 deployer 파생 주소로 등록한 데모용 가맹점이며 결제 주체로 쓰지 않는다.

## 가스

- deployer가 payer 1~5, merchant 1~3에 0.5 KAIA씩 분배했다 (`contracts/scripts/fund.ts`, 0.3 KAIA 이상이면 건너뜀).
- Kairos에서 결제 1건의 가스비는 약 0.005 KAIA 수준이다.

## 재실행

```
make deploy-kairos                                   # 재배포 (새 주소가 나오며 shared/가 갱신됨)
ENV_FILE=.env.kairos PORT=8011 make engine           # Kairos용 엔진
ENV_FILE=.env.kairos CHAIN_ID=1001 ENGINE_URL=http://127.0.0.1:8011 .venv/bin/pytest -m integration -s
```
