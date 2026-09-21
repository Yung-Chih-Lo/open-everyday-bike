"use client"
import { useEffect, useRef } from "react"
import { useResource } from "./client"
declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string
      remove: (id: string) => void
    }
  }
}
export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const { data } = useResource<{ turnstileSiteKey: string }>("/api/config")
  const container = useRef<HTMLDivElement>(null)
  const callback = useRef(onToken)
  useEffect(() => {
    callback.current = onToken
  }, [onToken])
  useEffect(() => {
    if (!data?.turnstileSiteKey) return
    let widget: string | undefined
    let alive = true
    const render = () => {
      if (alive && window.turnstile && container.current)
        widget = window.turnstile.render(container.current, {
          sitekey: data.turnstileSiteKey,
          callback: (token: string) => callback.current(token),
          "expired-callback": () => callback.current(""),
          "error-callback": () => callback.current(""),
        })
    }
    let script = document.querySelector<HTMLScriptElement>(
      "script[data-turnstile]"
    )
    if (window.turnstile) render()
    else {
      if (!script) {
        script = document.createElement("script")
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        script.dataset.turnstile = "true"
        script.async = true
        document.head.appendChild(script)
      }
      script.addEventListener("load", render)
    }
    return () => {
      alive = false
      script?.removeEventListener("load", render)
      if (widget) window.turnstile?.remove(widget)
    }
  }, [data])
  return <div className="flex w-full justify-center"><div ref={container} /></div>
}
