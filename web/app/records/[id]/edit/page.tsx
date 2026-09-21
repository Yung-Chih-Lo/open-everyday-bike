"use client"
import { useParams } from "next/navigation"
import { Editor } from "@/components/journal/editor"
import {
  useResource,
  RecordView,
  Notice,
  Loading,
} from "@/components/journal/client"
export default function EditRecord() {
  const { id } = useParams()
  const { data, error } = useResource<{ record: RecordView }>(
    `/api/records/${id}?edit=1`
  )
  return (
    <>
      <Notice message={error} />
      {data ? <Editor record={data.record} /> : !error && <Loading />}
    </>
  )
}
