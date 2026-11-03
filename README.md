# 3D — 삼덕청년부 웹앱

성도를 위한 모바일 우선 PWA입니다. 회원 메뉴는 **공지 → 기도운동 → 심방신청 → 기도요청 → 커뮤니티 → 목양지** 순서입니다. 목양지는 관리자·마을장·샘 리더에게만 표시됩니다. **관리자 → 기도운동 관리 맨 아래 → 기도운동 탭 활성화 → 저장**에서 모든 사용자의 기도운동 메뉴를 함께 표시/숨길 수 있습니다. 기본값은 활성화이며 도전 활성화 및 기존 기도 기록과는 별개입니다. 숨김 상태의 첫 접속은 공지로 이동하고, 이미 열린 메뉴는 화면 이동·메뉴 열기·다시 포커스하거나 최대 30초 주기로 새 설정을 확인합니다(온라인 상태 기준).

## 다른 공동체에 새로 설치하기

이 저장소는 **코드는 복사하되 기존 삼덕청년부의 DB·회원 데이터·비밀키는 복사하지 않는 방식**으로 다른 공동체에 독립 배포할 수 있습니다.

GitHub 계정도 없는 처음 사용자라면 [완전 초보자용 새 인스턴스 설치 가이드](docs/new-instance-setup.md)를 1단계부터 순서대로 진행하세요. 설치가 끝난 뒤에는 [출시 체크리스트](docs/new-instance-checklist.md)로 DB·로그인·커뮤니티·심방·목양지·공지까지 확인합니다. 선택 기능인 Gmail 접수 알림은 [이메일 알림 설치·사용 안내](docs/email-notifications.md)를 추가로 따릅니다.

> 기존 운영 환경의 `DATABASE_URL`, `SESSION_SECRET`, `PHONE_LOOKUP_PEPPER`, 암호화 키, Google OAuth secret을 다른 운영자에게 전달하지 마세요. 새 인스턴스는 새 Supabase 프로젝트와 새 비밀값을 사용합니다.

## 주요 기능

- 관리자 허용 명단 기반 이름/초기 전화번호 비밀번호 로그인, 비밀번호 변경·초기화, 180일 rolling session.
- 기도운동: 시작일부터 달력상 1개월, 월~토, 서울 기준 오늘·어제만 체크/취소. 실제 참여자 기준 통계와 공동순위.
- 심방신청: 날짜별 1건, 관리자 신청 기간·날짜 예외, 반복 요일 차단, Google Calendar 연동. Google Calendar 연결은 **관리자 → 심방 신청 관리 맨 아래**에서 합니다. 비공개 심방 사유는 Calendar에 전달하지 않습니다.
- 비공개 기도요청: 회원 작성, 관리자 조회·상태 관리·삭제.
- 커뮤니티: 폴더별 목록형 게시판·검색·페이지, 회원 글쓰기, 본인 게시글/댓글 수정·삭제, 관리자 폴더 생성·이름 변경·게시글 이동·삭제.
- 첨부파일: 최대 2개, 파일당 6MB(6,291,456바이트). 인증된 분할 업로드·다운로드, 해시 검증, 실패 시 재시도. 미완료 글은 다른 회원에게 공개하지 않습니다.
- 좋아요: 게시글마다 회원당 1개, 재클릭 취소, 목록/상세 개수 및 본인 상태 유지. 요청 중복과 응답 유실 재시도로 수가 늘거나 반전되지 않습니다.
- 공지: 관리자 초안·발행·읽음 집계, 이미지 1장(최대 3MB), 회원 메뉴의 읽지 않은 공지 `!` 표시. 기기 알림 권한 없이 앱 내 표시를 사용합니다.
- 목양지: 관리자·마을장·샘 리더만 접근, 올해·내년 월별 제출 요청, 리더 미제출 `!`, 사진·파일·직접입력 중 한 방식만 제출해도 완료. 본인 제출본 수정·삭제, 관리자 전체 제출본 관리와 TXT 다운로드를 지원합니다. 마을장은 본인 소속과 무관하게 담당 마을을 지정할 수 있고, 동명이인은 관리자 선택 후 성도 고유 ID로 연결합니다. [목양지 운영 안내](docs/pastoral-reports.md)
- 접수 이메일: 관리자 본인의 Gmail로 목양지·심방신청·기도요청의 샘·이름·심방 일시만 한 줄 알림. 별도 Gmail 승인·확인 메일·활성화가 필요하며 기존 자료와 본문·첨부는 보내지 않습니다.
- 관리자 메뉴는 대시보드·공지 관리·기도운동 관리·심방 신청 관리·기도요청 관리·커뮤니티 관리·목양지 관리·사용자 관리로 구성됩니다. 별도 설정 메뉴는 없으며 Google Calendar는 심방 신청 관리 맨 아래에서 관리합니다.

## 기술 구성

Next.js App Router / React / TypeScript, Drizzle ORM + node-postgres Pool, Supabase PostgreSQL의 비공개 `prayer_app` 스키마, Vercel 서울 함수 배포, Vitest·Playwright·GitHub Actions를 사용합니다. 마이그레이션/검사 스크립트 일부는 Postgres.js를 사용합니다.

커뮤니티 파일은 기존 서버 전용 DB 연결로 저장하며 공개 저장소나 새로운 비밀값이 필요하지 않습니다. 512KiB 단위 전송으로 Vercel 단일 요청/응답 크기 제한보다 작게 유지합니다. 파일은 DB 용량을 사용하므로 [커뮤니티 운영 안내](docs/community-operations.md)의 용량 점검이 필요합니다.

## 환경변수

실제 값은 저장소나 채팅에 올리지 않습니다. 기존 운영 비밀값을 보존합니다.

```text
DATABASE_URL=
SESSION_SECRET=
PHONE_LOOKUP_PEPPER=
ROSTER_ENCRYPTION_KEY=

# Google Calendar / Gmail OAuth client
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY=
```

`DATABASE_URL`은 Supabase pooler 연결 문자열입니다. 세션/전화번호 검색 비밀값은 각각 32자 이상, 두 암호화 키는 서로 다른 32바이트 Base64 값입니다. 사용하지 않는 선택 변수는 빈 문자열로 등록하지 말고 생략합니다. 기존 암호화 키를 변경하면 저장된 정보에 접근할 수 없으므로 임의로 교체하지 않습니다.

Gmail은 기존 OAuth Client를 사용하되 별도 발송용 토큰을 `ROSTER_ENCRYPTION_KEY`에서 파생한 용도별 키로 암호화합니다. Calendar 토큰과 키는 변경하지 않습니다. 수신 주소와 운영 원점은 비공개 DB 설정, 예약 발송 비밀값은 Supabase Vault에 보관합니다.

## 개발·검증

```bash
npm ci
npm test
npm run test:pastoral
npm run lint
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

E2E는 배포용 빌드를 `next start`로 실행합니다. CI는 TLS 일회용 PostgreSQL 17에 모든 마이그레이션과 가상 명단을 넣어 로그인부터 검사합니다. DB 검사에는 원격 DB나 실제 회원을 사용하지 않습니다. 로컬 DB 없이 건너뛴 결과를 전체 검증 통과로 간주하지 않습니다. Gmail 외부 발송은 가상 응답으로 검사하며 Preview/CI에서 실제 메일을 발송하지 않습니다.

전체 운영 절차는 [운영 가이드](docs/operations.md), 다른 공동체의 신규 설치는 [새 인스턴스 설치 가이드](docs/new-instance-setup.md), 커뮤니티 기능의 설계·검증 이력은 [설계](docs/superpowers/specs/2026-09-28-community-board-design.md) 및 [검증 기록](docs/superpowers/execution/2026-09-28-community-board.md)에 있습니다.

## 관리자 집계

[대시보드·목양지 확인·로그인 활성 상태 안내](docs/admin-dashboard.md)를 참고하세요. 활성 사용자(한 번 이상 로그인)와 기도운동 참여자(설정 기간 실제 체크)는 별도로 집계합니다. 최근 활동은 최신순 10건씩 조회합니다.

## 접수 이메일 알림 시작

**관리자 → 대시보드 → 맨 아래 접수 이메일 알림**을 펼쳐 수신 주소 저장 → 같은 Gmail 계정 연결 → 확인 메일 보내기 → 접수 이메일 알림 사용 체크 → 저장 순서로 진행합니다. Google Cloud의 Gmail API와 `gmail.send` 권한 설정이 필요할 수 있습니다. 신규 설치는 정식 원점 설정과 전용 Cron/Vault 준비도 필요합니다. [단계별 안내](docs/email-notifications.md)

알림 사용 전까지 자동 발송은 꺼져 있습니다. 접수 이후 발송 실패가 이미 저장된 원본을 취소하지 않으며, 결과가 불확실한 발송은 중복을 피하려고 자동 재발송하지 않습니다. 이를 정확히 한 번 배송 보장으로 해석하지 마세요.
