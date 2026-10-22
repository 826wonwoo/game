import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const scriptUrl = process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;

    if (!scriptUrl || scriptUrl.trim() === "") {
      return NextResponse.json(
        { result: "no_url", message: ".env.local에 NEXT_PUBLIC_GOOGLE_SCRIPT_URL이 설정되지 않았습니다." },
        { status: 200 }
      );
    }

    const body = await req.json();

    // Google Apps Script 웹 앱으로 POST 요청 전달 (서버 사이드이므로 브라우저 CORS 문제 없음)
    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Google Apps Script HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("API /api/sheets 프록시 오류:", error);
    return NextResponse.json(
      { result: "error", message: String(error), top3: [] },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const scriptUrl = process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;

    if (!scriptUrl || scriptUrl.trim() === "") {
      return NextResponse.json(
        { result: "no_url", message: ".env.local에 NEXT_PUBLIC_GOOGLE_SCRIPT_URL이 설정되지 않았습니다.", top3: [] },
        { status: 200 }
      );
    }

    const response = await fetch(scriptUrl, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`Google Apps Script HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("API /api/sheets GET 오류:", error);
    return NextResponse.json(
      { result: "error", message: String(error), top3: [] },
      { status: 500 }
    );
  }
}
