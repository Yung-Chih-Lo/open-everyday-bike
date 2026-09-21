import { randomBytes, scryptSync } from "node:crypto"
// Read from stdin to avoid putting plaintext credentials into process arguments.
let password = ""
for await (const chunk of process.stdin) password += chunk
password = password.trimEnd()
if (password.length < 12) throw new Error("Use at least 12 characters")
const salt = randomBytes(16).toString("hex")
console.log(`scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`)
