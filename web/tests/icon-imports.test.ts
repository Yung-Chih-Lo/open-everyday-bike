import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, basename } from "node:path"
import { expect, it } from "vitest"

it("uses individual icon exports with Linux-compatible filename casing", () => {
  const root = join(process.cwd(), "node_modules/@hugeicons/core-free-icons")
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  const components = join(process.cwd(), "components")
  for (const file of readdirSync(components, { recursive: true })) {
    if (typeof file !== "string" || !file.endsWith(".tsx")) continue
    const source = readFileSync(join(components, file), "utf8")
    for (const match of source.matchAll(
      /from ["'](@hugeicons\/core-free-icons[^"']*)["']/g
    )) {
      const specifier = match[1]
      // The package barrel references mis-cased Grid files on Linux.
      expect(specifier, file).not.toBe("@hugeicons/core-free-icons")
      const subpath = specifier.replace("@hugeicons/core-free-icons", ".")
      const entry = pkg.exports[subpath] ?? pkg.exports["./*"]
      expect(entry, specifier).toBeDefined()
      const target = join(root, entry.import.replace("*", subpath.slice(2)))
      expect(readdirSync(dirname(target)), specifier).toContain(
        basename(target)
      )
    }
  }
})
