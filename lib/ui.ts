/** 컴포넌트 여러 곳에서 반복되던 인풋·버튼·링크 스타일을 한 곳에 모은다. 로직 없음, 문자열 상수만. */

export const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm transition-colors focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 dark:border-zinc-700 dark:bg-zinc-900";

export const linkClass =
  "text-accent underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-sm";

export const secondaryButtonClass =
  "rounded-md border border-zinc-300 px-3 py-1 text-xs transition-colors hover:bg-zinc-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 dark:border-zinc-700 dark:hover:bg-zinc-800";

export const primaryButtonClass =
  "rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition-colors transition-transform hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

export const cardClass = "rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-900/60";

export const panelClass = "rounded-lg border border-zinc-200 p-4 dark:border-zinc-800";
