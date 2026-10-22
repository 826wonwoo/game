export interface HallOfFameRecord {
  rank: number;
  name: string;
  finishtime: string;
}

const LOCAL_STORAGE_KEY = "inu_brick_breaker_hof_v3";

export function timeStringToSeconds(timeStr: string): number {
  if (!timeStr) return -1;
  const parts = String(timeStr).trim().split(":");
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1], 10);
    if (isNaN(mins) || isNaN(secs)) return -1;
    const total = mins * 60 + secs;
    return total > 0 ? total : -1;
  }
  return -1;
}

/**
 * 3위까지 항상 3개 슬롯(1등, 2등, 3등)을 고정 채워주는 유틸리티
 */
export function ensureTop3Slots(list: HallOfFameRecord[]): HallOfFameRecord[] {
  const result: HallOfFameRecord[] = [];
  for (let i = 0; i < 3; i++) {
    if (list[i]) {
      result.push({
        rank: i + 1,
        name: list[i].name,
        finishtime: list[i].finishtime,
      });
    } else {
      result.push({
        rank: i + 1,
        name: "-",
        finishtime: "--:--",
      });
    }
  }
  return result;
}

export function getLocalHallOfFame(): HallOfFameRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const list: HallOfFameRecord[] = JSON.parse(raw);
    return list.filter((item) => item.name !== "-" && timeStringToSeconds(item.finishtime) > 0);
  } catch {
    return [];
  }
}

export function updateLocalHallOfFame(name: string, finishtime: string): HallOfFameRecord[] {
  const cleanName = (name || "익명").trim();
  const seconds = timeStringToSeconds(finishtime);

  if (seconds <= 0) {
    return ensureTop3Slots(getLocalHallOfFame());
  }

  const current = getLocalHallOfFame();
  const map = new Map<string, { name: string; finishtime: string; seconds: number }>();

  current.forEach((item) => {
    const s = timeStringToSeconds(item.finishtime);
    if (s > 0) {
      map.set(item.name, { name: item.name, finishtime: item.finishtime, seconds: s });
    }
  });

  const existing = map.get(cleanName);
  if (!existing || seconds < existing.seconds) {
    map.set(cleanName, { name: cleanName, finishtime, seconds });
  }

  const sorted = Array.from(map.values()).sort((a, b) => a.seconds - b.seconds);
  const topRecords = sorted.slice(0, 3).map((item, idx) => ({
    rank: idx + 1,
    name: item.name,
    finishtime: item.finishtime,
  }));

  if (typeof window !== "undefined") {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(topRecords));
  }

  return ensureTop3Slots(topRecords);
}

/**
 * 구글 앱스 스크립트(GAS) 및 백엔드로 결과 전송 후 항상 3위까지 슬롯 보장 반환
 */
export async function submitGameClearResult(
  name: string,
  finishtime: string
): Promise<HallOfFameRecord[]> {
  const fallback = updateLocalHallOfFame(name, finishtime);

  try {
    const res = await fetch("/api/sheets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        finishtime,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.top3)) {
        const validTop3 = data.top3.filter(
          (item: HallOfFameRecord) => item.name !== "-" && timeStringToSeconds(item.finishtime) > 0
        );

        if (validTop3.length > 0) {
          if (typeof window !== "undefined") {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(validTop3));
          }
          return ensureTop3Slots(validTop3);
        }
      }
    }
  } catch (apiError) {
    console.warn("/api/sheets 호출 실패:", apiError);
  }

  return fallback;
}
