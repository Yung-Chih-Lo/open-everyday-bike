import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"
export const bikes = sqliteTable(
  "bikes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    operator: text("operator").notNull().default("YouBike"),
    bikeNumber: text("bike_number").notNull(),
    bikeType: text("bike_type"),
  },
  (table) => [uniqueIndex("bike_identity").on(table.operator, table.bikeNumber)]
)
