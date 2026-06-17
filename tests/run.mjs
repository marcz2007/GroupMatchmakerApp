// Integration test runner. See tests/harness.mjs for env + usage.
import { cleanup, summary } from "./harness.mjs";
import { run as runSmart } from "./smart.test.mjs";
import { run as runPoll } from "./poll.test.mjs";
import { run as runIdentity } from "./identity.test.mjs";
import { run as runReconciler } from "./reconciler.test.mjs";

let ok = false;
try {
  await runSmart();
  await runPoll();
  await runIdentity();
  await runReconciler();
} catch (e) {
  console.error("\nFATAL:", e.message);
} finally {
  await cleanup();
  ok = summary();
}
process.exit(ok ? 0 : 1);
