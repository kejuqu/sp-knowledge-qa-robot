import { timingSafeEqual } from "node:crypto";
import { processDocumentJobs } from "@/lib/queue";
export const runtime="nodejs";
export const maxDuration=300;
export async function POST(request:Request) {
 const secret=process.env.INGEST_CRON_SECRET;
 const provided=request.headers.get("authorization")??"";
 const expected=`Bearer ${secret}`;
 if(!secret || Buffer.byteLength(provided)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(provided),Buffer.from(expected))) return Response.json({error:"unauthorized"},{status:401});
 return Response.json({processed:await processDocumentJobs(3)});
}
