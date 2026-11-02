import {processDocumentJobs} from "../apps/web/src/lib/queue";
processDocumentJobs(100).then((processed)=>{
 console.log(`Processed ${processed} document jobs.`);
}).catch((error)=>{
 console.error("Document worker failed",error instanceof Error?error.message:"Unknown error");
 process.exitCode=1;
});
