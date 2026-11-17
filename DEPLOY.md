# 배포·이전 안내 (Replit 없이 실행)

## 구성

```
브라우저 ──▶ 단일 Node 서비스 (Express)
              ├─ /            빌드된 React 화면 (artifacts/elt-analyzer/dist/public)
              ├─ /api/...     분석·음성·퀴즈·서술형·문법 학습지·동기화
              ├─ /api/sync/events/:room   SSE 실시간 알림 (PostgreSQL LISTEN/NOTIFY)
              └─ /api/sync/assets/...     교재 썸네일 ──▶ S3 호환 저장소 (Cloudflare R2)
           ──▶ PostgreSQL (elt_sync_rooms 테이블)
```

화면과 API가 같은 주소에서 나오므로 별도 리버스 프록시가 필요 없습니다.
권장 조합은 **Render(웹 서비스 + PostgreSQL) + Cloudflare R2(이미지)** 입니다.
Railway, Fly.io 등도 아래 명령을 그대로 쓰면 됩니다.

| 단계 | 명령 |
|---|---|
| 설치 | `corepack enable && pnpm install --frozen-lockfile` |
| 빌드 | `pnpm run build:node` |
| DB 스키마 | `pnpm run db:push` (테이블이 없을 때 생성. 기존 데이터는 지우지 않음) |
| 시작 | `pnpm run start:node` (`PORT`는 호스팅이 지정) |
| 상태 확인 | `GET /api/healthz` |

> 루트 `build`는 기존 Vercel용이라 그대로 두었습니다. 새 환경에서는 `build:node`를 사용하세요.
> `db:push`는 데이터를 지우지 않는 일반 모드입니다. `push-force`는 쓰지 마세요.

## 비밀값 (호스팅 대시보드의 Environment/Secrets에 직접 입력)

| 이름 | 설명 |
|---|---|
| `OPENAI_API_KEY` | 서버 전용. 화면 코드에 넣지 않습니다. |
| `DATABASE_URL` | Render는 render.yaml이 DB에서 자동 연결 |
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET` | R2 버킷 이름 (공개 접근 끄기) |
| `S3_ENDPOINT` | `https://<계정ID>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | R2 → API 토큰 (해당 버킷 Object Read & Write만) |
| `S3_REGION` | `auto` (R2) |

`VITE_SYNC_ROOM_ID`, `SYNC_SERVER_URL`, `SUPABASE_*`, `PRIVATE_OBJECT_DIR`는 새 환경에서 **설정하지 않습니다**.

## Render 배포 순서

1. 이 폴더를 GitHub 비공개 저장소에 올립니다(`.env`는 .gitignore로 제외됨).
2. Cloudflare → R2 → 버킷 생성 → "R2 API 토큰 관리"에서 해당 버킷 전용 읽기/쓰기 토큰 발급.
3. Render → New → **Blueprint** → 저장소 선택 → `render.yaml` 인식.
4. `sync: false`로 표시된 값(OPENAI_API_KEY, S3_*)을 Render 화면에 입력 → 배포.
5. 발급된 주소(예: `https://elt-analyzer.onrender.com`)에서 `/api/healthz`가 `{"status":"ok"}`인지 확인.

> 무료 플랜은 15분 유휴 후 잠들어 실시간 연결이 끊기고 무료 DB는 기한이 있어, render.yaml은 유료 최소 플랜(starter, basic-256mb)으로 적었습니다.

## 기존 자료 이전 (기존 Replit 앱은 끄지 않은 채 진행)

교재 목록·시험지·서술형·삭제 이력은 **동기화 방(room)** 단위로 PostgreSQL에 있고, 썸네일 이미지는 Replit App Storage에 따로 있습니다.
브라우저 저장 자료(localStorage)는 **주소(도메인)별로 분리**되므로 새 주소에서는 처음에 비어 보입니다. 지워진 것이 아닙니다.

**권장 방법 — 앱 안의 백업 파일로 이전 (이미지 포함)**

1. 사용하는 **모든 기기**에서 기존 Replit 앱을 열어 "실시간 연결됨"을 확인한 뒤
   `동기화 → 파일 내보내기/가져오기 → 내보내기`로 `elt-backup-날짜.json`을 저장합니다.
   (서버 이미지가 파일 안에 함께 들어가고, 수정·삭제 이력도 포함됩니다.)
2. 같은 화면의 **실시간 동기화** 탭에서 현재 동기화 코드(방 코드)를 적어 둡니다.
3. 새 주소를 `https://새주소/?r=<기존 방 코드>` 형태로 엽니다. 그러면 모든 기기가 이전과 같은 코드를 씁니다.
4. `파일 가져오기`로 1번 백업을 넣습니다. 기존 병합 규칙(sync-core)으로 합쳐지고, 이미지는 자동으로 R2에 올라갑니다.
   여러 기기의 백업을 차례로 가져와도 같은 규칙으로 병합되며, 덮어쓰지 않습니다.
5. 다른 기기에서도 3번 주소로 접속해 교재 수·이미지·문법 카드(`grammarWorksheetCards`)·시험·에세이를 확인합니다.

**보조 보관(선택)** — Replit Shell에서 `pg_dump --data-only -t elt_sync_rooms "$DATABASE_URL" > elt_sync_rooms.sql`로 원본 DB를 따로 보관해 두면 좋습니다.
다만 이 덤프만 새 DB에 넣으면 썸네일 주소는 그대로인데 이미지 파일은 Replit 저장소에 남아 있어 이미지가 열리지 않습니다. 그래서 주 이전 방법은 위의 백업 파일 방식입니다.

**전환 기준** — 새 주소에서 아래 흐름이 모두 확인되기 전에는 Replit 앱·DB·저장소를 삭제하거나 초기화하지 않습니다.

- 글 붙여넣기/사진 분석 → 저장 → 새로고침 후 유지
- 다른 기기에서 열기(실시간 반영)
- 문법 학습지 생성/재생성/인쇄
- 파이널 테스트, 서술형/에세이

## 로컬 개발

```bash
# 터미널 1 — DATABASE_URL, OPENAI_API_KEY, S3_* 를 셸 환경변수로 준비
PORT=8080 pnpm --filter @workspace/api-server run dev
# 터미널 2 — /api 를 8080으로 전달
API_PROXY_TARGET=http://localhost:8080 PORT=3000 BASE_PATH=/ pnpm --filter @workspace/elt-analyzer run dev
```

## 이번에 바꾼 것

- `artifacts/api-server/src/lib/sync-assets.ts`: 이미지 저장소 드라이버화(S3 호환 / 기존 Replit). 키 구조·`/api/sync/assets/...` 주소·중복 방지(내용 해시) 동일.
- `artifacts/api-server/src/routes/realtime-sync.ts`: 이미지 조회를 드라이버 경유로 변경. 응답 형식(`storage: "replit"` 표식 포함)은 기존 클라이언트 호환을 위해 그대로.
- `artifacts/api-server/src/app.ts`: 빌드된 화면 제공 + SPA 경로 처리(`/api` 제외).
- `artifacts/elt-analyzer/vite.config.ts`: `API_PROXY_TARGET`이 있을 때만 개발용 `/api` 프록시.
- 문구: "Replit Secrets"/"Replit 저장소" → "호스팅 환경의 비밀값(Secrets)"/"서버 저장소".
- 추가: `render.yaml`, `.env.example`(이름만), `DEPLOY.md`, 루트 스크립트 `build:node`/`start:node`/`db:push`, 의존성 `aws4fetch`.
- 그대로 둔 것: Supabase·파일 저장 구형 경로(`sync.ts`), Vercel 핸들러(`api/`, `vercel.json`).
  `api/lib/sync-proxy.ts`의 기본 주소는 여전히 기존 Replit이므로 **새 환경을 Vercel로 배포하지 마세요**.
