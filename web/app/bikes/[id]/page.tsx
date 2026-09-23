"use client"
import { Suspense } from "react"
import { useParams, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  PageHeading,
  RecordList,
  RecordView,
  useResource,
  Notice,
  Loading,
} from "@/components/journal/client"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination"
import { Button } from "@/components/ui/button"
function History({ id, page }: { id: string; page: string }) {
  const { data, error } = useResource<{
    bike: { id: number; bikeNumber: string }
    records: RecordView[]
    total: number
    page: number
    pages: number
    latestRiddenOn: string | null
  }>(`/api/bikes/${id}?page=${encodeURIComponent(page)}`)
  return (
    <>
      <Notice message={error} />
      {data ? (
        <>
          <PageHeading
            eyebrow="ONE BIKE, MANY STORIES"
            title={`車號 ${data.bike.bikeNumber}`}
            description={
              data.latestRiddenOn
                ? `最後騎乘紀錄：${data.latestRiddenOn}。歷史心得不代表當前車況或位置。`
                : "這台車還沒有公開紀錄。"
            }
          />
          <div className="history-summary">
            <h2>騎乘紀錄</h2>
            <p className="muted">
              共 {data.total} 筆 · 第 {data.page} / {data.pages} 頁
            </p>
          </div>
          <RecordList records={data.records} />
          <Pagination aria-label="騎乘紀錄分頁" className="mt-8">
            <PaginationContent>
              <PaginationItem>
                {data.page > 1 ? (
                  <Button variant="outline" asChild>
                    <Link href={`/bikes/${id}?page=${data.page - 1}`}>
                      上一頁
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" disabled>
                    上一頁
                  </Button>
                )}
              </PaginationItem>
              {Array.from(
                { length: Math.min(5, data.pages) },
                (_, i) =>
                  Math.max(1, Math.min(data.page - 2, data.pages - 4)) + i
              ).map((n) => (
                <PaginationItem key={n}>
                  <PaginationLink
                    href={`/bikes/${id}?page=${n}`}
                    isActive={n === data.page}
                    aria-label={`第 ${n} 頁`}
                  >
                    {n}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                {data.page < data.pages ? (
                  <Button variant="outline" asChild>
                    <Link href={`/bikes/${id}?page=${data.page + 1}`}>
                      下一頁
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" disabled>
                    下一頁
                  </Button>
                )}
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </>
      ) : (
        !error && <Loading />
      )}
    </>
  )
}
function BikePage() {
  const { id } = useParams<{ id: string }>()
  const page = useSearchParams().get("page") || "1"
  return <History key={`${id}/${page}`} id={id} page={page} />
}
export default function Bike() {
  return (
    <Suspense fallback={<Loading />}>
      <BikePage />
    </Suspense>
  )
}
