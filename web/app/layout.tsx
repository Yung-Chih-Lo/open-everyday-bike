import type { Metadata } from "next"
import Link from "next/link"
import "./globals.css"
import { Button } from "@/components/ui/button"
export const metadata: Metadata = {
  title: {
    default: "open-everyday-bike｜每一台車，都有故事",
    template: "%s｜open-everyday-bike",
  },
  description: "搜尋 YouBike 車號，分享真實騎乘感受，讓下一段旅程多一點了解。",
}
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-Hant">
      <body>
        <a href="#main" className="skip-link">
          跳至主要內容
        </a>
        <header className="site-header">
          <Link href="/" className="brand" aria-label="open-everyday-bike首頁">
            <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
              <g
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="17" cy="42" r="10" />
                <circle cx="48" cy="42" r="10" />
                <path d="M17 42l10-20 11 20H17l17-15h9l5 15M24 22h8M40 18h6l-3 9" />
              </g>
            </svg>
            <span>open-everyday-bike</span>
          </Link>
          <nav aria-label="主要導覽">
            <Link href="/me">我的紀錄</Link>
            <Button asChild>
              <Link href="/records/new">＋ 寫一筆</Link>
            </Button>
          </nav>
        </header>
        <main id="main" className="site-main">
          {children}
        </main>
        <footer className="site-footer">
          <div>
            <strong>open-everyday-bike</strong>
            <p>留下這次感受，陪下一個人出發。</p>
          </div>
          <div className="footer-links">
            <a
              href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=ycl1006.project%40gmail.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              問題與回饋
            </a>
          </div>
          <p className="footer-note">
            民間騎乘紀錄，與 YouBike
            官方無關。歷史心得不代表車輛目前位置或車況。
          </p>
        </footer>
      </body>
    </html>
  )
}
