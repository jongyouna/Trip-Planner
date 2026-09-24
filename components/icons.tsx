/** 새 아이콘 라이브러리를 추가하는 대신, 필요한 만큼만 손으로 그린 인라인 SVG. */

export function ChevronIcon({ direction, className }: { direction: "up" | "down"; className?: string }) {
  return (
    <svg
      viewBox="0 0 12 8"
      aria-hidden
      className={className}
      style={{ transform: direction === "down" ? "rotate(180deg)" : undefined }}
    >
      <path d="M1 6.5 6 1.5 11 6.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 14 14" aria-hidden className={className}>
      <path
        d="M5.5 2.5H2.5A1 1 0 0 0 1.5 3.5v8A1 1 0 0 0 2.5 12.5h8a1 1 0 0 0 1-1v-3M8.5 1.5h4v4M12 2 6.5 7.5"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
