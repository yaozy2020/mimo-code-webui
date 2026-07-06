import * as React from "react"
import { cn } from "@/lib/utils"

interface TabsProps {
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
  className?: string
}

function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <div className={cn("w-full", className)}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child
        return React.cloneElement(child as React.ReactElement<TabListProps | TabsContentProps>, {
          activeValue: value,
          onValueChange,
        })
      })}
    </div>
  )
}

interface TabListProps {
  children: React.ReactNode
  activeValue?: string
  onValueChange?: (value: string) => void
  className?: string
}

function TabsList({ children, activeValue, onValueChange, className }: TabListProps) {
  return (
    <div className={cn("inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground", className)}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child
        return React.cloneElement(child as React.ReactElement<TabTriggerProps>, {
          activeValue,
          onValueChange,
        })
      })}
    </div>
  )
}

interface TabTriggerProps {
  value: string
  children: React.ReactNode
  activeValue?: string
  onValueChange?: (value: string) => void
  className?: string
}

function TabsTrigger({ value, children, activeValue, onValueChange, className }: TabTriggerProps) {
  const active = activeValue === value
  return (
    <button
      onClick={() => onValueChange?.(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        active ? "bg-background text-foreground shadow-sm" : "hover:bg-background/50 hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  )
}

interface TabsContentProps {
  value: string
  children: React.ReactNode
  activeValue?: string
  className?: string
}

function TabsContent({ value, children, activeValue, className }: TabsContentProps) {
  if (activeValue !== value) return null
  return <div className={cn("mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className)}>{children}</div>
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
