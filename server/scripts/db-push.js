// Neon's free-tier compute auto-suspends. During a Render build the first
// connection can be dropped with "terminating connection due to administrator
// command" (SqlState 57P01) while the DB wakes up. Retry a few times so the
// wake-up doesn't fail the whole deploy.
const { execSync } = require("child_process");

const MAX_ATTEMPTS = 6;
const WAIT_SECONDS = 8;

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
    console.log(`✔ prisma db push succeeded (attempt ${attempt})`);
    process.exit(0);
  } catch {
    console.log(`✖ prisma db push failed (attempt ${attempt}/${MAX_ATTEMPTS})`);
    if (attempt < MAX_ATTEMPTS) {
      console.log(`  waiting ${WAIT_SECONDS}s for the database to wake up...`);
      try { execSync(`sleep ${WAIT_SECONDS}`); } catch { /* ignore */ }
    }
  }
}

console.error("prisma db push failed after all retries");
process.exit(1);
