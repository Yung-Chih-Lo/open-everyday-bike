"use client"
import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Notice,
  Loading,
  RecordList,
  RecordView,
  useResource,
} from "@/components/journal/client"
export default function Home() {
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState("")
  const { data, error } = useResource<{ records: RecordView[] }>(
    `/api/records?q=${encodeURIComponent(search)}`
  )
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">EVERY RIDE HAS A STORY</p>
          <h1>
            下一段路，
            <br />
            從一台好車開始<span>。</span>
          </h1>
          <p className="hero-copy">
            記下踩踏的感覺、街角的風景。
            <br />
            用一份真實心得，讓下一個騎士多一點了解。
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setSearch(query)
            }}
            className="search-form"
          >
            <Field>
              <FieldLabel htmlFor="search">找找這台車的故事</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="輸入車號，例如 0120297"
                  inputMode="numeric"
                />
                <Button type="submit">查車號 ↗</Button>
              </div>
            </Field>
          </form>
          <p className="hero-note">免註冊 · 真實感受 · 一鍵產生分享圖</p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-caption">
            GOOD RIDES.
            <br />
            GOOD STORIES.
          </div>
          <svg viewBox="0 0 420 300">
            <circle cx="100" cy="205" r="67" />
            <circle cx="323" cy="205" r="67" />
            <path d="M100 205 158 100 227 205H100l95-69 32 69 61-117 35 117M141 100h45M277 88h37l14 20" />
            <path className="bike-accent" d="m163 111 39 40 32-4-10-36z" />
          </svg>
          <div className="art-bottom">
            <span>城市裡的小小騎乘筆記</span>
            <span>01 — ∞</span>
          </div>
        </div>
      </section>
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE COMMUNITY JOURNAL</p>
            <h2>{search ? `車號「${search}」的紀錄` : "剛剛，有人騎過"}</h2>
          </div>
          <Button asChild variant="outline">
            <Link href="/records/new">分享我的騎乘</Link>
          </Button>
        </div>
        <Notice message={error} />
        {data ? <RecordList records={data.records} /> : !error && <Loading />}
      </section>
      <section className="how-strip">
        <div>
          <b>01</b>
          <h3>找到車號</h3>
          <p>看一看車身上的編號。</p>
        </div>
        <div>
          <b>02</b>
          <h3>留下感受</h3>
          <p>六個面向，一份自己的總評。</p>
        </div>
        <div>
          <b>03</b>
          <h3>帶走分享圖</h3>
          <p>把這次騎乘，變成一張紀念。</p>
        </div>
      </section>
    </>
  )
}
