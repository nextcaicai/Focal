import type { LexicalPluginFC } from "@follow/components/ui/lexical-rich-editor/types.js"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import type { RefObject } from "react"
import { useCallback, useEffect, useRef } from "react"

import { FileAttachmentNode } from "./FileAttachmentNode"
import { useFileAttachmentBlockSync } from "./hooks/useFileAttachmentBlockSync"
import { useFileUploadIntegration } from "./hooks/useFileUploadIntegration"
import type { FileUploadPluginConfig } from "./types"
import {
  clipboardEventHasFiles,
  createDragCounter,
  dragEventHasFiles,
  getFilesFromDrop,
  getFilesFromPaste,
  preventDefaultDrag,
} from "./utils/file-handling"

const defaultConfig: FileUploadPluginConfig = {
  enableDragDrop: true,
  enablePaste: true,
}

export const FileUploadPlugin: LexicalPluginFC = () => {
  const [editor] = useLexicalComposerContext()

  // Initialize file attachment block synchronization
  const { handleFileAttachmentInsert } = useFileAttachmentBlockSync()

  // Initialize file upload integration with sync callback
  const { handleFileDrop, handlePaste } = useFileUploadIntegration(handleFileAttachmentInsert)

  const dragCounterRef: RefObject<ReturnType<typeof createDragCounter>> = useRef(undefined) as any
  if (!dragCounterRef.current) {
    dragCounterRef.current = createDragCounter()
  }

  const finalConfig = defaultConfig

  // Handle drag enter
  const handleDragEnter = useCallback(
    (event: DragEvent) => {
      if (!finalConfig.enableDragDrop || !dragEventHasFiles(event)) return

      preventDefaultDrag(event)
    },
    [finalConfig.enableDragDrop],
  )

  // Handle drag over
  const handleDragOver = useCallback(
    (event: DragEvent) => {
      if (!finalConfig.enableDragDrop || !dragEventHasFiles(event)) return

      preventDefaultDrag(event)
    },
    [finalConfig.enableDragDrop],
  )

  // Handle drag leave
  const handleDragLeave = useCallback(
    (event: DragEvent) => {
      if (!finalConfig.enableDragDrop) return

      preventDefaultDrag(event)

      const newCounter = dragCounterRef.current.decrement()

      if (newCounter <= 0) {
        dragCounterRef.current.reset()
      }
    },
    [finalConfig.enableDragDrop],
  )

  // Handle drop
  const handleDrop = useCallback(
    async (event: DragEvent) => {
      if (!finalConfig.enableDragDrop) return

      preventDefaultDrag(event)

      dragCounterRef.current.reset()

      const files = getFilesFromDrop(event)

      if (files && files.length > 0) {
        await handleFileDrop(files)
      }
    },
    [finalConfig.enableDragDrop, handleFileDrop],
  )

  // Handle paste
  const handlePasteEvent = useCallback(
    async (event: ClipboardEvent) => {
      if (!finalConfig.enablePaste || !clipboardEventHasFiles(event)) return

      event.preventDefault()

      const files = getFilesFromPaste(event)

      if (files && files.length > 0) {
        await handlePaste(event.clipboardData!)
      }
    },
    [finalConfig.enablePaste, handlePaste],
  )

  // Set up event listeners
  useEffect(() => {
    const removeEventListeners = (rootElement: HTMLElement) => {
      if (finalConfig.enableDragDrop) {
        rootElement.removeEventListener("dragenter", handleDragEnter)
        rootElement.removeEventListener("dragover", handleDragOver)
        rootElement.removeEventListener("dragleave", handleDragLeave)
        rootElement.removeEventListener("drop", handleDrop)
      }

      if (finalConfig.enablePaste) {
        rootElement.removeEventListener("paste", handlePasteEvent)
      }
    }

    let activeRootElement: HTMLElement | null = null
    const removeRootListener = editor.registerRootListener((rootElement, prevRootElement) => {
      // Remove previous listeners
      if (prevRootElement) {
        removeEventListeners(prevRootElement)
      }

      activeRootElement = rootElement

      // Add new listeners
      if (rootElement) {
        /* eslint-disable @eslint-react/web-api/no-leaked-event-listener -- Lexical can replace its root; removeEventListeners handles both replacement and effect cleanup. */
        if (finalConfig.enableDragDrop) {
          rootElement.addEventListener("dragenter", handleDragEnter, { passive: false })
          rootElement.addEventListener("dragover", handleDragOver, { passive: false })
          rootElement.addEventListener("dragleave", handleDragLeave, { passive: false })
          rootElement.addEventListener("drop", handleDrop, { passive: false })
        }

        if (finalConfig.enablePaste) {
          rootElement.addEventListener("paste", handlePasteEvent, { passive: false })
        }
        /* eslint-enable @eslint-react/web-api/no-leaked-event-listener */
      }
    })

    return () => {
      if (activeRootElement) {
        removeEventListeners(activeRootElement)
      }
      removeRootListener()
    }
  }, [
    editor,
    finalConfig,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePasteEvent,
  ])

  return null
}

FileUploadPlugin.id = "file-upload"
FileUploadPlugin.nodes = [FileAttachmentNode]
