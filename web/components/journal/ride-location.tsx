"use client"
import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

const cities = [
  "台北市",
  "新北市",
  "基隆市",
  "桃園市",
  "新竹市",
  "新竹縣",
  "苗栗縣",
  "台中市",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義市",
  "嘉義縣",
  "台南市",
  "高雄市",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "台東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
]
export function RideLocation({
  value,
  onChange,
}: {
  value: string
  onChange: (city: string) => void
}) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id="city"
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label="騎乘縣市"
          className="w-full justify-between"
        >
          {value || "請選擇縣市"}
          <span aria-hidden="true">⌄</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0"
      >
        <Command
          filter={(city, query) =>
            city
              .replaceAll("臺", "台")
              .includes(query.trim().replaceAll("臺", "台"))
              ? 1
              : 0
          }
        >
          <CommandInput placeholder="搜尋縣市…" aria-label="搜尋縣市" />
          <CommandList id={listId}>
            <CommandEmpty>找不到符合的縣市</CommandEmpty>
            <CommandGroup heading="縣市">
              {cities.map((city) => (
                <CommandItem
                  key={city}
                  value={city}
                  onSelect={() => {
                    onChange(city)
                    setOpen(false)
                  }}
                >
                  {city}
                  {city === value && (
                    <span className="ml-auto" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
