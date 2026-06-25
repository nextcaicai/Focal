import { useDndContext } from "@dnd-kit/core"
import { useEffect, useRef } from "react"

import { useFeedAreaScrollProgressValue } from "./atom"

export function useShouldFreeUpSpace() {
  const dndContext = useDndContext()
  const isDragging = !!dndContext.active
  const scrollProgress = useFeedAreaScrollProgressValue()
  const hadFreeSpaceDuringDragRef = useRef(false)
  const shouldFreeUpSpace =
    isDragging && (scrollProgress === 0 || hadFreeSpaceDuringDragRef.current)

  useEffect(() => {
    if (!isDragging) {
      hadFreeSpaceDuringDragRef.current = false
      return
    }

    if (scrollProgress === 0) {
      hadFreeSpaceDuringDragRef.current = true
    }
  }, [isDragging, scrollProgress])

  return shouldFreeUpSpace
}
