/** 수집 시각으로부터 지난 시간(시). 클라이언트에서도 쓰므로 node 모듈을 import하지 않는다. */
export function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}
