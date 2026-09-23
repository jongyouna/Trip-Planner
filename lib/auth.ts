/**
 * 탐색 버튼을 쓸 수 있는 계정. 화면 표시용 판정이며, 실제 강제는 Firestore 규칙(isRootAdmin)이
 * 하고 워커가 한 번 더 확인한다. 세 곳의 이메일이 같아야 한다 (docs/firebase-setup.md).
 */
export const ALLOWED_EMAILS: readonly string[] = ["jongyouna@gmail.com"];

export function isAllowedEmail(email: string | null | undefined): boolean {
  return !!email && ALLOWED_EMAILS.includes(email.toLowerCase());
}

/** 조용히 무시할 팝업 오류(사용자가 창을 닫음 등) */
const SILENT_CODES = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request"]);

/** Firebase Auth 오류 코드를 사용자에게 보여 줄 문구로 바꾼다. 무시할 오류는 null. */
export function authErrorMessage(code: string | undefined): string | null {
  if (code && SILENT_CODES.has(code)) return null;
  switch (code) {
    case "auth/unauthorized-domain":
      return "이 주소가 Firebase 승인 도메인에 없습니다. Firebase 콘솔 > Authentication > Settings > Authorized domains에 추가하세요.";
    case "auth/popup-blocked":
      return "브라우저가 로그인 팝업을 막았습니다. 팝업을 허용한 뒤 다시 시도하세요.";
    case "auth/network-request-failed":
      return "네트워크 오류로 로그인하지 못했습니다.";
    default:
      return `로그인하지 못했습니다${code ? ` (${code})` : ""}.`;
  }
}
