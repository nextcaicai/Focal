import { cn } from "@follow/utils/utils"
import type { FC } from "react"

type UpdateVersionBadgeProps = {
  className?: string
  label?: string
  onClick?: () => void
  version: string | null
}

export const UpdateVersionBadge: FC<UpdateVersionBadgeProps> = ({
  className,
  label,
  onClick,
  version,
}) => {
  const text = version ? `v${version}` : label
  if (!text) {
    return null
  }

  const sharedClassName = cn(
    "inline-flex shrink-0 items-center rounded-md bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent",
    onClick &&
      "cursor-pointer transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
    className,
  )

  if (onClick) {
    return (
      <button type="button" className={sharedClassName} onClick={onClick}>
        {label && version ? (
          <>
            <span>{label}</span>
            <span className="mx-1 text-accent/40">/</span>
            <span>v{version}</span>
          </>
        ) : (
          text
        )}
      </button>
    )
  }

  return <span className={sharedClassName}>{text}</span>
}
