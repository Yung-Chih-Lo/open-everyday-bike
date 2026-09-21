import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { test, expect } from "vitest"
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]
  )
}
test("external SDKs stay behind adapters and cross-module imports use public seams", () => {
  const allowed = new Set(["records/types", "share-card/layout"])
  for (const file of files("modules").filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts")
  )) {
    const source = readFileSync(file, "utf8"),
      owner = file.split("/")[1]
    if (
      source.includes("from '@aws-sdk/") ||
      source.includes('from "@aws-sdk/')
    )
      expect(owner).toBe("storage")
    if (
      source.includes('from "@typesafe-ai/') ||
      source.includes("from '@typesafe-ai/")
    )
      expect(owner).toBe("moderation")
    for (const match of source.matchAll(/from ['"]@\/modules\/([^'"]+)['"]/g)) {
      const target = match[1]
      if (target.includes("/") && target.split("/")[0] !== owner)
        expect(
          allowed.has(target),
          `${relative(".", file)} imports private ${target}`
        ).toBe(true)
    }
  }
})
