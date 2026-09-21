import { eq, and } from "drizzle-orm"
import { getDb } from "@/infra/db"
import { bikes } from "./schema"
export type Bike = { id: number; bikeNumber: string }
export function findOrCreateBike(bikeNumber: string): Bike {
  const db = getDb()
  db.insert(bikes).values({ bikeNumber }).onConflictDoNothing().run()
  return db
    .select({ id: bikes.id, bikeNumber: bikes.bikeNumber })
    .from(bikes)
    .where(and(eq(bikes.bikeNumber, bikeNumber), eq(bikes.operator, "YouBike")))
    .get()!
}
export function getBike(id: number) {
  return getDb()
    .select({ id: bikes.id, bikeNumber: bikes.bikeNumber })
    .from(bikes)
    .where(eq(bikes.id, id))
    .get()
}
