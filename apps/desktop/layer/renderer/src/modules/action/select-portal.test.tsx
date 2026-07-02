import { RootPortalContext } from "@follow/components/ui/portal/provider.js"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@follow/components/ui/select/index.js"
import * as React from "react"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest"

describe("portaled select content", () => {
  let root: Root | null = null
  let container: HTMLElement | null = null

  beforeAll(() => {
    ;(globalThis as typeof globalThis & { React: typeof React }).React = React
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    window.setTimeout ??= globalThis.setTimeout.bind(globalThis)
    window.clearTimeout ??= globalThis.clearTimeout.bind(globalThis)
    window.addEventListener ??= globalThis.addEventListener?.bind(globalThis) ?? (() => {})
    window.removeEventListener ??= globalThis.removeEventListener?.bind(globalThis) ?? (() => {})
    window.Element ??= globalThis.Element
    window.HTMLElement ??= globalThis.HTMLElement
    window.HTMLSelectElement ??= globalThis.HTMLSelectElement
    window.Node ??= globalThis.Node
    window.Event ??= globalThis.Event
    window.getComputedStyle ??= () =>
      ({
        getPropertyValue: () => "",
      }) as unknown as CSSStyleDeclaration
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount()
      })
    }

    container?.remove()
    root = null
    container = null
  })

  test("does not bubble menu item clicks to the modal outside-click surface", async () => {
    container = document.createElement("div")
    document.body.append(container)

    const modalSurface = document.createElement("div")
    const modalContent = document.createElement("div")
    const portalRoot = document.createElement("div")
    const closeFromOutsideClick = vi.fn()

    modalSurface.addEventListener("click", closeFromOutsideClick)
    modalSurface.append(modalContent, portalRoot)
    container.append(modalSurface)

    root = createRoot(modalContent)

    await act(async () => {
      root!.render(
        <RootPortalContext value={portalRoot}>
          <Select open value="title">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="title">Feed title</SelectItem>
            </SelectContent>
          </Select>
        </RootPortalContext>,
      )
    })

    const menuItem = Array.from(portalRoot.querySelectorAll<HTMLElement>("[role='option']")).find(
      (element) => element.textContent?.includes("Feed title"),
    )

    expect(menuItem).toBeTruthy()

    await act(async () => {
      menuItem!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(closeFromOutsideClick).not.toHaveBeenCalled()
  })
})
