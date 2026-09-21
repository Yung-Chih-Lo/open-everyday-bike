import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { mkdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
let connection: Database.Database | undefined
export function getSqlite() {
  if (!connection) {
    const path = process.env.DATABASE_PATH || "./data/app.sqlite"
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true })
    connection = new Database(path)
    connection.pragma("journal_mode = WAL")
    connection.pragma("foreign_keys = ON")
    connection.pragma("busy_timeout = 5000")
    connection.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)"
    )
    if (
      !connection
        .prepare("SELECT 1 FROM schema_migrations WHERE version=1")
        .get()
    )
      connection.transaction(() => {
        connection!.exec(
          readFileSync(
            join(process.cwd(), "migrations/0001_initial.sql"),
            "utf8"
          )
        )
        connection!.prepare("INSERT INTO schema_migrations VALUES (1)").run()
      })()
  }
  return connection
}
export function getDb() {
  return drizzle(getSqlite())
}
export function closeDb() {
  connection?.close()
  connection = undefined
}
