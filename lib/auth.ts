/**
 * 탐색 버튼을 쓸 수 있는 계정. 화면 표시용 판정이며, 실제 강제는 Firestore 규칙(isRootAdmin)이
 * 하고 워커가 한 번 더 확인한다. 세 곳의 이메일이 같아야 한다 (docs/firebase-setup.md).
 */
export const ALLOWED_EMAILS: readonly string[] = ["jongyouna@gmail.com"];

export function isAllowedEmail(email: string | null | undefined): boolean {
  return !!email && ALLOWED_EMAILS.includes(email.toLowerCase());
}

/** Firebase Auth(이메일/비밀번호) 오류 코드를 사용자에게 보여 줄 문구로 바꾼다. */
export function authErrorMessage(code: string | undefined): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "이메일 또는 비밀번호가 올바르지 않습니다.";
    case "auth/invalid-email":
      return "이메일 형식이 올바르지 않습니다.";
    case "auth/too-many-requests":
      return "시도가 너무 많습니다. 잠시 후 다시 시도하세요.";
    case "auth/network-request-failed":
      return "네트워크 오류로 로그인하지 못했습니다.";
    default:
      return `로그인하지 못했습니다${code ? ` (${code})` : ""}.`;
  }
}
