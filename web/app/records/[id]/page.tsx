import type { Metadata } from "next"
import Detail from "@/components/journal/detail"
import { getRecord } from "@/modules/records"
import { decorate } from "@/modules/publishing"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const number = Number(id)
  const record =
    Number.isSafeInteger(number) && number > 0 ? getRecord(number) : undefined
  // Public metadata never reads an editable version or uses the viewer's session.
  if (!record || record.status !== "published")
    return {
      title: "騎乘紀錄",
      robots: { index: false, follow: false },
      openGraph: {
        title: "騎乘紀錄｜open-everyday-bike",
        description: "記下每一次騎乘的感受。",
        images: [],
      },
      twitter: { card: "summary", images: [] },
    }
  const published = decorate(record)
  const title = `${record.content.bikeNumber} · ${record.content.shortComment || "騎乘筆記"}`
  const description =
    `${record.content.riddenOn} · ${record.content.city} · 整體評等 ${record.content.overallGrade}。${record.content.impression}`.slice(
      0,
      180
    )
  const images = published.shareUrl
    ? [{ url: published.shareUrl, width: 1080, height: 1080, alt: title }]
    : []
  return {
    title,
    description,
    openGraph: { title, description, type: "article", images },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title,
      description,
      images: images.map((image) => image.url),
    },
  }
}
export default function RecordPage() {
  return <Detail />
}
