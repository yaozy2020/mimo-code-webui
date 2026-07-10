import * as React from "react"
import { cn } from "@/lib/utils"
import { switchThumbClassName, switchTrackClassName } from "./switchStyles"

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "role"> {}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(({ className, ...props }, ref) => (
  <label
    className={cn(
      switchTrackClassName,
      className,
    )}
  >
    <input type="checkbox" className="peer sr-only" ref={ref} {...props} />
    <span
      className={cn(
        switchThumbClassName,
      )}
    />
  </label>
))
Switch.displayName = "Switch"

export { Switch }
