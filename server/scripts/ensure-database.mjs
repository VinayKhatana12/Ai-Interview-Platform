// Creates the application database if it does not exist yet.
// Connects to the "postgres" maintenance database on the same server,
// checks pg_database, and runs CREATE DATABASE when needed.
// Prints host and database name only — never credentials.
import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy server/.env.example to server/.env and fill it in.");
  process.exit(1);
}

let target;
try {
  target = new URL(url);
} catch {
  console.error("DATABASE_URL is not a valid connection URL.");
  process.exit(1);
}
if (target.protocol !== "postgresql:") {
  console.error(`Expected a postgresql:// URL, got ${target.protocol}//. Not switching databases.`);
  process.exit(1);
}

const dbName = decodeURIComponent(target.pathname.replace(/^\//, ""));
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(dbName)) {
  console.error(`Database name "${dbName}" is not a plain identifier; refusing to run CREATE DATABASE.`);
  process.exit(1);
}

const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";

const client = new pg.Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (rowCount === 0) {
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`Created database "${dbName}" on ${target.host}.`);
  } else {
    console.log(`Database "${dbName}" already exists on ${target.host}.`);
  }
} catch (err) {
  console.error(`Could not prepare the database on ${target.host}: ${err.message}`);
  console.error("Check that the postgresql-x64-18 service is running and the password in server/.env is correct.");
  process.exit(1);
} finally {
  await client.end();
}
