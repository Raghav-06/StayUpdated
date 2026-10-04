import "dotenv/config";
import app from "./app.js";
import { migrate } from "./db/index.js";

const PORT = process.env.PORT || 5000;

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.warn("WARNING: JWT_SECRET is missing or shorter than 32 characters: sign-in and sign-up will fail");
}

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
  console.warn("Google sign-in is not configured (GOOGLE_CLIENT_ID / SECRET / REDIRECT_URI): the Google button will show a 'not available' message");
}

if (process.env.DATABASE_URL) {
  try {
    await migrate();
    console.log("Database schema is up to date");
  } catch (err) {
    console.error(`Could not reach the database (${err.code ?? err.message}): sign-in, sign-up and history will fail until PostgreSQL is running`);
  }
} else {
  console.warn("DATABASE_URL is not set: sign-in and news history will not work");
}

app.listen(PORT, () => {
  console.log(`StayUpdated backend running on http://localhost:${PORT}`);
});
