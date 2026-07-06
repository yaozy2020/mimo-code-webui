import * as React from "react"
import { cn } from "@/lib/utils"

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  className?: string
}

function Tooltip({ content, children, className }: TooltipProps) {
  return (
    <div className={cn("group relative inline-block", className)}>
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground group-hover:block">
        {content}
      </div>
    </div>
  )
}

export { Tooltip }
