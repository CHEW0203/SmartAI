import { NextResponse } from "next/server";

/** CORS for Chrome extension + arbitrary page origins calling the study API. */
export const STUDY_CAPTURE_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

export function studyCaptureJson(
  body: unknown,
  init?: { status?: number },
): NextResponse {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: STUDY_CAPTURE_CORS_HEADERS,
  });
}

export function studyCaptureOptions(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: STUDY_CAPTURE_CORS_HEADERS,
  });
}
