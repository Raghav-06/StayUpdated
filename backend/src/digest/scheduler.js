// Schedules the daily digest. Started only from server.js, never when the app is imported (tests).
import cron from "node-cron";
import { lastFullRun, runDigest } from "./digest.js";

const CATCH_UP_DELAY_MS = 2 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

async function runSafely(reason) {
  try {
    console.log(`Digest: starting ${reason} run`);
    await runDigest();
  } catch (err) {
    console.error(`Digest: ${reason} run failed: ${err.message}`);
  }
}

export function startDigestScheduler() {
  if (process.env.DIGEST_ENABLED === "false") {
    console.log("Daily digest is off (DIGEST_ENABLED=false)");
    return;
  }
  const expression = process.env.DIGEST_CRON || "0 8 * * *";
  const timezone = process.env.DIGEST_TIMEZONE || "Asia/Kolkata";
  if (!cron.validate(expression)) {
    console.error(`DIGEST_CRON "${expression}" is not a valid cron expression: the daily digest won't run`);
    return;
  }

  // noOverlap: node-cron skips a tick while the previous one is still running (runDigest also guards).
  cron.schedule(expression, () => runSafely("scheduled"), { timezone, noOverlap: true, name: "daily-digest" });
  console.log(`Daily digest scheduled: "${expression}" (${timezone})`);

  // Missed runs (server was down at the scheduled time): catch up shortly after startup.
  lastFullRun()
    .then((last) => {
      if (last && Date.now() - last.getTime() < DAY_MS) return;
      console.log(`Digest: last full run ${last ? last.toISOString() : "never"}; catching up in 2 minutes`);
      setTimeout(() => runSafely("catch-up"), CATCH_UP_DELAY_MS).unref();
    })
    .catch((err) => console.error(`Digest: couldn't read the last run time: ${err.message}`));
}
