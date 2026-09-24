import { describe, expect, it } from "vitest";
import { authErrorMessage, isAllowedEmail } from "./auth";
import { addDays, makeSearchRequestSchema, nightsBetween, todayKst } from "./jobs";

const TODAY = "2026-09-22";
const schema = makeSearchRequestSchema(TODAY);
const ok = { region: "포천", checkin: "2026-09-23", checkout: "2026-09-24", maxPrice: 50000 };

const firstMessage = (input: unknown) => {
  const r = schema.safeParse(input);
  return r.success ? null : r.error.issues[0].message;
};

describe("탐색 요청 검증", () => {
  it("유효한 요청을 통과시키고 지역 공백을 다듬는다", () => {
    expect(schema.parse({ ...ok, region: "  포천 " }).region).toBe("포천");
  });

  it("오늘 체크인은 허용, 과거는 거부", () => {
    expect(schema.safeParse({ ...ok, checkin: TODAY, checkout: "2026-09-23" }).success).toBe(true);
    expect(firstMessage({ ...ok, checkin: "2026-09-21", checkout: "2026-09-22" })).toContain("오늘 이후");
  });

  it("체크아웃은 체크인보다 뒤여야 한다", () => {
    expect(firstMessage({ ...ok, checkout: "2026-09-23" })).toContain("체크아웃");
    expect(firstMessage({ ...ok, checkout: "2026-09-20" })).toContain("체크아웃");
  });

  it("숙박 30박·체크인 1년 한도", () => {
    expect(schema.safeParse({ ...ok, checkin: "2026-09-23", checkout: "2026-10-23" }).success).toBe(true);
    expect(firstMessage({ ...ok, checkin: "2026-09-23", checkout: "2026-10-24" })).toContain("30박");
    expect(firstMessage({ ...ok, checkin: "2027-09-23", checkout: "2027-09-24" })).toContain("1년");
  });

  it("지역·날짜 형식·가격 범위를 거부한다", () => {
    expect(schema.safeParse({ ...ok, region: "" }).success).toBe(false);
    expect(schema.safeParse({ ...ok, region: "가".repeat(21) }).success).toBe(false);
    expect(schema.safeParse({ ...ok, checkin: "9/23" }).success).toBe(false);
    expect(schema.safeParse({ ...ok, maxPrice: 500 }).success).toBe(false);
    expect(schema.safeParse({ ...ok, maxPrice: 600000 }).success).toBe(false);
    expect(schema.safeParse({ ...ok, maxPrice: 50000.5 }).success).toBe(false);
  });
});

describe("날짜 계산", () => {
  it("addDays·nightsBetween은 월 경계를 넘는다", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(nightsBetween("2026-09-30", "2026-10-02")).toBe(2);
  });

  it("todayKst는 UTC 15시 이후를 다음 날로 본다", () => {
    expect(todayKst(new Date("2026-09-21T15:00:00Z"))).toBe("2026-09-22");
    expect(todayKst(new Date("2026-09-21T14:59:00Z"))).toBe("2026-09-21");
  });
});

describe("auth 유틸", () => {
  it("허용 이메일만 통과(대소문자 무시)", () => {
    expect(isAllowedEmail("jongyouna@gmail.com")).toBe(true);
    expect(isAllowedEmail("JongYouna@Gmail.com")).toBe(true);
    expect(isAllowedEmail("other@gmail.com")).toBe(false);
    expect(isAllowedEmail(null)).toBe(false);
  });

  it("이메일/비밀번호 오류 코드를 안내 문구로 바꾼다", () => {
    expect(authErrorMessage("auth/invalid-credential")).toContain("이메일 또는 비밀번호");
    expect(authErrorMessage("auth/too-many-requests")).toContain("잠시 후");
    expect(authErrorMessage(undefined)).toContain("로그인하지 못했습니다");
  });
});
