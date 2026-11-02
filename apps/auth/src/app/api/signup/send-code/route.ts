import { NextResponse } from "next/server";

// Registration now sends the confirmation email in a single submission.
export async function POST() {
  return NextResponse.json({ error: "请直接提交注册表单" }, { status: 410 });
}
