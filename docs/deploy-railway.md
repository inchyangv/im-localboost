# Railway 엔진 배포 기록

- 프로젝트: `im-localboost` / 서비스: `engine` / 환경: `production`
- 서비스 URL: https://engine-production-1edd.up.railway.app
  - 헬스체크: https://engine-production-1edd.up.railway.app/health
- 빌드: `engine/Dockerfile` (빌드 컨텍스트는 저장소 루트). 합성 데이터 생성과 모델 학습이 이미지 빌드 단계에서 실행된다.
- 볼륨: `engine-volume`, mount path `/data` (SQLite `DB_PATH=/data/engine.db`가 재배포 후에도 유지된다)

## 서비스 변수 (이름만, 값은 기록하지 않는다)

| 이름 | 설명 |
| --- | --- |
| `RPC_URL` | Kairos 공개 RPC |
| `CHAIN_ID` | `1001` |
| `DB_PATH` | `/data/engine.db` |
| `WEB_ORIGIN` | CORS 허용 오리진 (Vercel 배포 후 웹 URL로 갱신) |
| `ORACLE_KEY` | 율 게시용 키. stdin으로만 입력했고 로그·인자에 남기지 않았다 |
| `ATTESTER_KEY` | 결제 서명용 키. 동일 |
| `RAILWAY_DOCKERFILE_PATH` | `engine/Dockerfile`. 이 CLI 버전(5.47)에서 `railway.json`의 빌더 설정이 무시되고 railpack 자동 감지로 빠지기 때문에 변수로 지정했다 |

## 명령

```
railway status --json                                 # 링크된 프로젝트·서비스 확인
railway up --service engine --ci                      # 재배포 (업로드 → 빌드 → 배포, 로그 스트리밍)
railway redeploy --service engine -y                  # 마지막 이미지로 재시작
railway logs --service engine                         # 런타임 로그
railway variable list --service engine --json         # 변수 확인 (값이 포함되므로 출력을 공유하지 않는다)
echo -n "<value>" | railway variable set KEY --stdin --service engine --skip-deploys
```

주의: `railway volume add`는 `--service`·`--environment`를 이름이 아니라 ID로 넘겨야 동작했다 (이름으로 넘기면 CLI가 panic).

## 검증 (2026-09-18)

- `/health`: `ok: true`, `chainId: 1001`, `model: true`, `contract`가 `shared/deployments.json["1001"].contracts.DalgubeolPay`와 일치, 30초 간격 두 번 호출에서 `lastBlock` 228092357 → 228092388 증가
- `/payments?limit=5`: Kairos 첫 결제 `0xc7d8bf8b…b94f` 표시, `railway redeploy` 이후에도 유지
- `POST /rates/publish {"overrides":{"4":1000}}`: txHash 반환, Kairos에서 `currentRate(4) == 1000`
- `OPTIONS /attest` (Origin `https://anything.vercel.app`): `access-control-allow-origin` 헤더 있음
