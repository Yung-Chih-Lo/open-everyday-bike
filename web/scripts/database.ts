import { getSqlite, closeDb } from "../infra/db"
import Database from "better-sqlite3"
import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
const [command, file] = process.argv.slice(2)
if (command === "migrate") {
  getSqlite()
  closeDb()
  console.log("Database migrations applied")
} else if (command === "backup" && file) {
  const dest = resolve(file)
  if (existsSync(dest)) throw new Error("Backup destination already exists")
  mkdirSync(dirname(dest), { recursive: true })
  await getSqlite().backup(dest)
  closeDb()
  console.log("Backup complete")
} else if (command === "restore" && file) {
  const dest = resolve(process.env.DATABASE_PATH || "./data/app.sqlite")
  if (existsSync(dest))
    throw new Error(
      "Restore only to a NEW path. Stop app and choose a new DATABASE_PATH."
    )
  const source = new Database(file, { readonly: true })
  if (source.pragma("integrity_check", { simple: true }) !== "ok")
    throw new Error("Backup integrity failed")
  source.close()
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(file, dest)
  console.log("Restore complete; start app using the new path")
} else
  throw new Error(
    "Usage: database.ts migrate | backup <new-path> | restore <backup-path>"
  )
