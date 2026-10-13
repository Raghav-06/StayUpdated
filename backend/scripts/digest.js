// Runs the daily digest once and exits. Run with: npm run digest
import "dotenv/config";
import { getPool, migrate } from "../src/db/index.js";
import { runDigest } from "../src/digest/digest.js";

let exitCode = 0;
try {
  await migrate();
  const stats = await runDigest();
  if (stats.failures) exitCode = 1;
} catch (err) {
  console.error(`Digest failed: ${err.message}`);
  exitCode = 1;
} finally {
  await getPool().end().catch(() => {});
}
process.exit(exitCode);
