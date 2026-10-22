export interface HallOfFameRecord {
  rank: number;
  name: string;
  finishtime: string;
}

const LOCAL_STORAGE_KEY = "inu_brick_breaker_hof_v2";

export function timeStringToSeconds(timeStr: string): number {
  if (!timeStr) return -1;
  const parts = timeStr.trim().split(":");
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1], 10);
    if (isNaN(mins) || isNaN(secs)) return -1;
    const total = mins * 60 + secs;
    return total > 0 ? total : -1;
  }
  return -1;
}

export function getLocalHallOfFame(): HallOfFameRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const list: HallOfFameRecord[] = JSON.parse(raw);
    return list.filter((item) => timeStringToSeconds(item.finishtime) > 0);
  } catch {
    return [];
  }
}

export function updateLocalHallOfFame(name: string, finishtime: string): HallOfFameRecord[] {
  const cleanName = (name || "익명").trim();
  const seconds = timeStringToSeconds(finishtime);

  if (seconds <= 0) {
    return getLocalHallOfFame();
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
  const top3 = sorted.slice(0, 3).map((item, idx) => ({
    rank: idx + 1,
    name: item.name,
    finishtime: item.finishtime,
  }));

  if (typeof window !== "undefined") {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(top3));
  }

  return top3;
}

/**
 * .env.local의 NEXT_PUBLIC_GOOGLE_SCRIPT_URL 키 값을 이용해
 * 백엔드 라우트(/api/sheets) 및 직접 호출을 수행하여 구글 앱스 스크립트 실행
 */
export async function submitGameClearResult(
  name: string,
  finishtime: string
): Promise<HallOfFameRecord[]> {
  const localTop3 = updateLocalHallOfFame(name, finishtime);

  // 1. Next.js 내부 API 라우트 (/api/sheets)를 통해 서버 측에서 NEXT_PUBLIC_GOOGLE_SCRIPT_URL로 안전하게 전송
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
      if (data && Array.isArray(data.top3) && data.top3.length > 0) {
        const validTop3 = data.top3.filter((item: HallOfFameRecord) => timeStringToSeconds(item.finishtime) > 0);
        if (validTop3.length > 0) {
          if (typeof window !== "undefined") {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(validTop3));
          }
          return validTop3;
        }
      }
      return localTop3;
    }
  } catch (apiError) {
    console.warn("/api/sheets 호출 실패, 브라우저 직접 fetch 시도:", apiError);
    // 내부 API가 네트워크 에러 등으로 실패했을 때만 직접 fetch 시도
    const directUrl = process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;
    if (directUrl && directUrl.trim() !== "") {
      try {
        const directRes = await fetch(directUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ name, finishtime }),
        });
        if (directRes.ok) {
          const data = await directRes.json();
          if (data && Array.isArray(data.top3) && data.top3.length > 0) {
            return data.top3;
          }
        }
      } catch (err) {
        console.error("Google Apps Script 직접 실행 실패:", err);
      }
    }
  }

  return localTop3;
}
