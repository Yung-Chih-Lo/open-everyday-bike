import { test, expect } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import Database from "better-sqlite3"
test("CLI backup and restore preserve committed WAL data and reject overwriting an existing database", () => {
  const dir = mkdtempSync(join(tmpdir(), "ubike-backup-"))
  const source = join(dir, "source.sqlite"),
    backup = join(dir, "backup.sqlite"),
    target = join(dir, "restored.sqlite")
  const run = (path: string, ...args: string[]) =>
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/database.ts", ...args],
      { env: { ...process.env, DATABASE_PATH: path }, stdio: "pipe" }
    )
  try {
    run(source, "migrate")
    const db = new Database(source)
    db.pragma("journal_mode = WAL")
    db.prepare("UPDATE site_settings SET moderation_enabled=1 WHERE id=1").run()
    run(source, "backup", backup)
    db.close()
    run(target, "restore", backup)
    const restored = new Database(target)
    expect(
      restored
        .prepare("SELECT moderation_enabled AS enabled FROM site_settings")
        .get()
    ).toEqual({ enabled: 1 })
    expect(restored.pragma("integrity_check", { simple: true })).toBe("ok")
    restored.close()
    expect(() => run(target, "restore", backup)).toThrow()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
