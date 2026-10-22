import { NextResponse } from "next/server";

const SHEET_ID = "1uk6VV-keLtpSoCv8CjHnruYeWsyyFU5mEtCtqIIn2Gs";

// mm:ss 또는 m:ss 형식을 초(seconds)로 변환
function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return -1;
  const parts = String(timeStr).trim().split(":");
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1], 10);
    if (!isNaN(mins) && !isNaN(secs)) {
      const total = mins * 60 + secs;
      return total > 0 ? total : -1;
    }
  }
  return -1;
}

// 00:00 포맷으로 정규화
function formatTimeStr(totalSec: number): string {
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// 공개 구글 스프레드시트 CSV 데이터를 직접 파싱하여 전체 사용자 중 1, 2, 3위 계산
async function fetchTop3FromGoogleSheetDirect(): Promise<Array<{ rank: number; name: string; finishtime: string }>> {
  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
    const res = await fetch(csvUrl, { cache: "no-store" });
    if (!res.ok) {
      console.error("구글 시트 CSV 직접 조회 실패:", res.status);
      return [];
    }

    const csvText = await res.text();
    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);

    // 첫 줄(헤더) 제외
    const userBestMap = new Map<string, { name: string; finishtime: string; seconds: number }>();

    for (let i = 1; i < lines.length; i++) {
      // CSV 파싱 (쉼표 구분)
      const cols = lines[i].split(",").map(c => c.replace(/^["']|["']$/g, "").trim());
      if (cols.length >= 3) {
        const name = cols[1];
        const timeRaw = cols[2];
        const seconds = parseTimeToSeconds(timeRaw);

        if (name && seconds > 0) {
          const formatted = formatTimeStr(seconds);
          const existing = userBestMap.get(name);
          if (!existing || seconds < existing.seconds) {
            userBestMap.set(name, { name, finishtime: formatted, seconds });
          }
        }
      }
    }

    // 소요 시간이 적은 순(오름차순) 정렬
    const sorted = Array.from(userBestMap.values()).sort((a, b) => a.seconds - b.seconds);

    return sorted.slice(0, 3).map((item, idx) => ({
      rank: idx + 1,
      name: item.name,
      finishtime: item.finishtime,
    }));
  } catch (err) {
    console.error("fetchTop3FromGoogleSheetDirect 에러:", err);
    return [];
  }
}

export async function POST(req: Request) {
  try {
    const scriptUrl = process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;
    const body = await req.json();

    // 1. Google Apps Script로 새 기록 저장
    if (scriptUrl && scriptUrl.trim() !== "") {
      try {
        await fetch(scriptUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (postErr) {
        console.error("GAS 저장 요청 실패:", postErr);
      }
    }

    // 잠시 0.5초 대기 후 구글 시트의 전체 데이터로부터 정확한 TOP 3 산출
    await new Promise(resolve => setTimeout(resolve, 500));
    const top3 = await fetchTop3FromGoogleSheetDirect();

    return NextResponse.json({
      result: "success",
      top3,
    });
  } catch (error) {
    console.error("API /api/sheets POST 에러:", error);
    return NextResponse.json(
      { result: "error", message: String(error), top3: [] },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const top3 = await fetchTop3FromGoogleSheetDirect();
    return NextResponse.json({
      result: "success",
      top3,
    });
  } catch (error) {
    return NextResponse.json(
      { result: "error", message: String(error), top3: [] },
      { status: 500 }
    );
  }
}
