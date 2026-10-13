// Runs once in the main vitest process.
export default function () {
  if (!process.env.DATABASE_URL_TEST) {
    process.stderr.write(
      "\n  DATABASE_URL_TEST is not set: the database tests will be skipped.\n" +
        "  Point it at an empty Postgres database (not your real one) to run them, e.g.\n" +
        "  DATABASE_URL_TEST=postgres://postgres:password@localhost:5432/stayupdated_test npm test\n\n"
    );
  }
}
