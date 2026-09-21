import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { closeDb, getSqlite } from "@/infra/db"
import {
  authenticate,
  createIdentity,
  recoverIdentity,
  rotateIdentity,
  setContributorStatus,
} from "@/modules/identity"

let directory: string
beforeEach(() => {
  closeDb()
  directory = mkdtempSync(join(tmpdir(), "ubike-identity-"))
  vi.stubEnv("DATABASE_PATH", join(directory, "test.sqlite"))
})
afterEach(() => {
  closeDb()
  vi.unstubAllEnvs()
  rmSync(directory, { recursive: true, force: true })
})
it("stores only hashes and never authenticates public codes or recovery codes as sessions", () => {
  const identity = createIdentity()
  expect(authenticate(identity.sessionToken)?.id).toBe(identity.contributor.id)
  expect(authenticate(identity.contributor.publicCode)).toBeUndefined()
  expect(authenticate(identity.recoveryCode)).toBeUndefined()
  const persisted = JSON.stringify([
    getSqlite().prepare("SELECT * FROM contributors").all(),
    getSqlite().prepare("SELECT * FROM sessions").all(),
  ])
  expect(persisted).not.toContain(identity.sessionToken)
  expect(persisted).not.toContain(identity.recoveryCode)
})
it("recovery rotates the recovery code and invalidates the previous device session", () => {
  const first = createIdentity(),
    recovered = recoverIdentity(first.recoveryCode)
  expect(recovered.contributor.id).toBe(first.contributor.id)
  expect(authenticate(first.sessionToken)).toBeUndefined()
  expect(authenticate(recovered.sessionToken)?.id).toBe(first.contributor.id)
  expect(() => recoverIdentity(first.recoveryCode)).toThrow("無效")
  expect(() => recoverIdentity(first.contributor.publicCode)).toThrow("無效")
})
it("persists identity across connection restarts, expires sessions and blocks disabled recovery", () => {
  const first = createIdentity()
  closeDb()
  expect(authenticate(first.sessionToken)?.id).toBe(first.contributor.id)
  getSqlite().prepare("UPDATE sessions SET expires_at=0").run()
  expect(authenticate(first.sessionToken)).toBeUndefined()
  const replacement = rotateIdentity(first.contributor.id)
  setContributorStatus(first.contributor.id, true)
  expect(() => recoverIdentity(replacement.recoveryCode)).toThrow("停用")
})
