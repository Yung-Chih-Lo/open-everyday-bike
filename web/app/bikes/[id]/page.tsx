"use client"
import { useParams } from "next/navigation"
import {
  PageHeading,
  RecordList,
  RecordView,
  useResource,
  Notice,
  Loading,
} from "@/components/journal/client"
export default function Bike() {
  const { id } = useParams()
  const { data, error } = useResource<{
    bike: { id: number; bikeNumber: string }
    records: RecordView[]
  }>(`/api/bikes/${id}`)
  return (
    <>
      <Notice message={error} />
      {data ? (
        <>
          <PageHeading
            eyebrow="ONE BIKE, MANY STORIES"
            title={`車號 ${data.bike.bikeNumber}`}
            description={
              data.records.length
                ? `最後騎乘紀錄：${data.records[0].content.riddenOn}。歷史心得不代表當前車況或位置。`
                : "這台車還沒有公開紀錄。"
            }
          />
          <RecordList records={data.records} />
        </>
      ) : (
        !error && <Loading />
      )}
    </>
  )
}
