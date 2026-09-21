"use client"
/* eslint-disable @next/next/no-img-element -- Images are server-sized assets or local blob/SVG previews; avoid a second optimizer and preserve authenticated access. */

import { OverallGrade } from "./overall-grade"
import { useEffect, useState } from "react"
import Link from "next/link"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"

export type { RideInput, RecordView } from "@/modules/records/types"
import type { RecordView } from "@/modules/records/types"
export const scoreLabels = ["推進", "整潔", "操控", "車況", "感應", "機動"]
export const grade = (n: number | null) =>
  n === null ? "未評" : ["", "E", "D", "C", "B", "A"][n]
export const numberLabel = (n: number) => `No.${String(n).padStart(3, "0")}`
export async function request<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers:
      options?.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options?.headers },
  })
  const result = await response.json()
  if (!response.ok)
    throw new Error(
      result.error || result.message || "暫時無法完成，請稍後再試。"
    )
  return result
}
export function useResource<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let live = true
    request<T>(url)
      .then((value) => {
        if (live) {
          setData(value)
          setError("")
        }
      })
      .catch((e) => {
        if (live) {
          setData(null)
          setError(e.message)
        }
      })
    return () => {
      live = false
    }
  }, [url, revision])
  return { data, error, reload: () => setRevision((n) => n + 1) }
}
export function Notice({ message }: { message: string }) {
  return message ? (
    <Alert role="status">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  ) : null
}
export function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-label="載入中">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-52 w-full" />
    </div>
  )
}
export function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description?: string
}) {
  return (
    <header className="page-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {description && <p className="muted">{description}</p>}
    </header>
  )
}
export function RecordList({
  records,
  manage = false,
}: {
  records: RecordView[]
  manage?: boolean
}) {
  return records.length ? (
    <div className="record-grid">
      {records.map((record) => (
        <Card key={record.id} className="overflow-hidden">
          <Link href={`/records/${record.id}`} className="record-photo">
            {record.imageUrl ? (
              <img
                src={record.imageUrl}
                alt={`單車 ${record.content.bikeNumber}`}
                loading="lazy"
              />
            ) : (
              <div className="photo-placeholder">{numberLabel(record.id)}</div>
            )}
            <span className="grade-stamp">
              <OverallGrade value={record.content.overallGrade} />
            </span>
          </Link>
          <CardHeader>
            <CardDescription>
              {record.content.riddenOn} · {record.content.city}
            </CardDescription>
            <CardTitle>
              <Link href={`/records/${record.id}`}>
                {record.content.bikeNumber}
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="short-comment">{record.content.shortComment}</p>
          </CardContent>
          <CardFooter className="flex flex-wrap justify-between gap-2">
            <Badge variant="secondary">{record.authorCode}</Badge>
            {manage ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/records/${record.id}/edit`}>
                  {record.status === "published" ? "編輯" : "繼續填寫"}
                </Link>
              </Button>
            ) : (
              <span className="muted text-xs">{numberLabel(record.id)}</span>
            )}
            {manage && (
              <Badge variant="outline">
                {{
                  draft: "草稿",
                  published: "已發布",
                  hidden: "已隱藏",
                  deleted: "已刪除",
                }[record.status] || record.status}
              </Badge>
            )}
          </CardFooter>
        </Card>
      ))}
    </div>
  ) : (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>這裡還沒有騎乘紀錄</EmptyTitle>
        <EmptyDescription>
          每一段騎乘，都值得留下。成為第一位記錄的人。
        </EmptyDescription>
      </EmptyHeader>
      <Button asChild>
        <Link href="/records/new">寫下第一筆</Link>
      </Button>
    </Empty>
  )
}
