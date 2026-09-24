# Firebase 설정 (이메일/비밀번호 로그인 + 최저가 탐색)

대시보드는 GitHub Pages 정적 사이트다. 로그인은 Firebase Auth(클라이언트, 이메일/비밀번호), 권한 강제는 Firestore 보안 규칙,
수집은 자택 PC의 워커(`npm run worker`)가 맡는다. Firebase 프로젝트는 `buja-map-vercel`과 같은 `buja-map-b52eb`를 쓴다.

```
브라우저 --이메일/비밀번호 로그인--> Firebase Auth
   └ "최저가 탐색" --> Firestore searchJobs/{uid} (status=queued)
자택 PC `npm run worker` --> running --> 수집 --> searchResults/{uid} + status=done|error
브라우저 <-- onSnapshot -- 상태·결과, config/worker(heartbeat)
```

## 1회 설정 (콘솔에서 직접)

1. **로그인 제공자**: Firebase 콘솔 > Authentication > Sign-in method에서 "이메일/비밀번호"를 켠다.
2. **계정 생성**: Authentication > Users > "사용자 추가"에서 계정을 하나 직접 만든다. 이메일은 `lib/auth.ts`의
   `ALLOWED_EMAILS`와 반드시 같아야 한다(현재 `jongyouna@gmail.com`). 앱 안에는 회원가입 화면이 없다 — 허용 계정이
   하나뿐이라 콘솔에서 수동으로만 만든다.
3. **승인 도메인**: Firebase 콘솔 > Authentication > Settings > Authorized domains에 `jongyouna.github.io` 추가.
   (**완료** — 2026-09-22 확인. `localhost`는 기본 포함.)
4. **Firestore 규칙**: `buja-map-vercel/firestore.rules`의 `match /config/{docId}` 블록 아래에 다음을 **추가**하고
   콘솔 > Firestore Database > 규칙에서 게시한다. 기존 규칙(users, config, savedViews)은 지우지 않는다.
   허용 이메일은 `isRootAdmin()`의 값과 `lib/auth.ts`의 `ALLOWED_EMAILS`가 같아야 한다.

   ```
   // 최저가 탐색 요청. 문서 ID = uid 이므로 사용자당 1건이다.
   // 진행 중(running)에는 덮어쓸 수 없다. 상태 전환·결과 기록은 워커(Admin SDK, 규칙 우회)만 한다.
   match /searchJobs/{uid} {
     allow read: if signedIn() && (request.auth.uid == uid || isAdmin());
     allow create: if isRootAdmin()
       && request.auth.uid == uid
       && request.resource.data.status == 'queued'
       && request.resource.data.keys().hasOnly(['region', 'checkin', 'checkout', 'maxPrice', 'status', 'requestedAt', 'email']);
     allow update: if isRootAdmin()
       && request.auth.uid == uid
       && resource.data.status in ['queued', 'done', 'error']
       && request.resource.data.status == 'queued'
       && request.resource.data.keys().hasOnly(['region', 'checkin', 'checkout', 'maxPrice', 'status', 'requestedAt', 'email']);
     allow delete: if false;
   }

   // 워커가 쓰는 결과. 브라우저는 읽기만 한다.
   match /searchResults/{uid} {
     allow read: if signedIn() && (request.auth.uid == uid || isAdmin());
     allow write: if false;
   }
   ```

   `config/worker`(워커 heartbeat)는 기존 `config` 규칙(읽기 공개·쓰기 관리자)으로 충분하다. 워커는 Admin SDK로 쓴다.
5. **서비스 계정 키**: 콘솔 > 프로젝트 설정 > 서비스 계정 > "새 비공개 키 생성". JSON을 **리포 밖**(예: `C:\Users\jongy\secrets\`)에
   저장하고 절대 커밋하지 않는다(리포는 public). `.gitignore`가 `*serviceAccount*.json`, `*-firebase-adminsdk-*.json`을 막지만
   리포 밖 보관이 원칙이다.

## 워커 실행

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\jongy\secrets\buja-map-b52eb-firebase-adminsdk.json"
npm run worker
```

- 워커가 켜져 있는 동안만 요청이 처리된다. 꺼져 있으면 웹에 "워커가 꺼져 있는 것 같습니다"가 뜨고 요청은 대기열에 남는다.
- 30초마다 `config/worker.lastSeen`을 갱신한다(2분 넘게 없으면 오프라인 표시). Ctrl+C로 종료하면 즉시 오프라인 처리된다.
- 요청마다 (1) 트랜잭션으로 `queued → running` 선점, (2) Firebase Auth에서 계정 이메일·검증 여부 재확인, (3) `lib/jobs.ts`
  스키마로 재검증한 뒤 수집한다. 사이트가 접근을 막으면(`BlockedError`) 우회하지 않고 `error`로 끝낸다.
- 수집 결과는 `data/hotels.json`에도 병합된다. 공개 사이트에 반영하려면 종전처럼 커밋·푸시한다.

## 알아둘 점

- `data/hotels.json`과 Pages는 여전히 **공개**다. 로그인은 "탐색 트리거"만 보호하고 이미 공개된 표는 숨기지 않는다.
- 웹 탐색 결과(`searchResults/{uid}`)는 로그인한 본인 화면에서만 표에 합쳐진다. 가격 낮은 순 300곳까지만 저장한다.
- `firebaseConfig`(apiKey 등)는 공개돼도 안전한 값이다(접근 제어는 Auth + 규칙). 서비스 계정 키와는 다르다.
