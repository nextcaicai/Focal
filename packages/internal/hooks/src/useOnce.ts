import { useEffect, useRef } from "react"

export const useOnce = (fn: () => any) => {
  const isDone = useRef(false)
  const fnRef = useRef(fn)
  fnRef.current = fn
  useEffect(() => {
    if (isDone.current) return
    fnRef.current()
    isDone.current = true
  }, [])
}
