import {
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto"
export const token = () => randomBytes(32).toString("base64url")
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex")
export function passwordMatches(password: string, encoded: string) {
  try {
    const [scheme, salt, digest] = encoded.split(":")
    if (scheme !== "scrypt" || !salt || !digest) return false
    const expected = Buffer.from(digest, "hex")
    const actual = scryptSync(password, salt, 64)
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    )
  } catch {
    return false
  }
}
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message)
  }
}
