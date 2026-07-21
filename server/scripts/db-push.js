// Robust `prisma db push` for deploys:
// - --accept-data-loss: our schema changes are purely additive (new nullable
//   columns, new tables, a unique constraint on the empty `meliOrderId`
//   column), but Prisma still emits a data-loss warning for the new unique
//   constraint and refuses to proceed without this flag. Nothing is dropped.
// - retry loop: Neon's free-tier compute auto-suspends and can drop the first
//   connection with SqlState 57P01 while it wakes up; retrying rides that out.
const { execSync } = require("child_process");

const MAX_ATTEMPTS = 6;
const WAIT_SECONDS = 8;

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", { stdio: "inherit" });
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
