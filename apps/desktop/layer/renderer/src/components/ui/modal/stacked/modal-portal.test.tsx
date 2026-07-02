import { RootPortal } from "@follow/components/ui/portal/index.js"
import * as React from "react"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest"

import { PlainModal } from "./custom-modal"
import { ModalInternal } from "./modal"

vi.mock("./internal/use-animate", () => ({
  // eslint-disable-next-line @eslint-react/hooks-extra/ensure-custom-hooks-using-other-hooks, @eslint-react/hooks-extra/no-unnecessary-use-prefix
  useModalAnimate: () => ({
    animateController: {},
    isClosing: false,
    playExitAnimation: vi.fn(),
    playNoticeAnimation: vi.fn(),
    readyToClose: vi.fn(),
  }),
}))

vi.mock("~/components/common/Focusable", async () => {
  const React = await import("react")

  return {
    Focusable: ({
      children,
      ref,
      ...props
    }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>> & {
      ref?: React.Ref<HTMLDivElement>
    }) => (
      <div ref={ref} {...props}>
        {children}
      </div>
    ),
  }
})

const PortalOption = () => {
  const [visible, setVisible] = React.useState(true)

  if (!visible) return null

  return (
    <RootPortal>
      <button
        type="button"
        data-modal-nested-interaction=""
        data-testid="portal-option"
        onPointerDown={() => setVisible(false)}
      >
        Portal option
      </button>
    </RootPortal>
  )
}

const ContentOption = () => {
  const [visible, setVisible] = React.useState(true)

  if (!visible) return null

  return (
    <button type="button" data-testid="content-option" onPointerDown={() => setVisible(false)}>
      Content option
    </button>
  )
}

describe("ModalInternal portaled children", () => {
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

  test("does not dismiss when a click starts from a portaled child that unmounts before click", async () => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    const onClose = vi.fn()

    await act(async () => {
      root!.render(
        <ModalInternal
          item={{
            id: "settings",
            title: "Settings",
            content: PortalOption,
            CustomModalComponent: PlainModal,
            clickOutsideToDismiss: true,
          }}
          index={0}
          isTop
          isBottom
          onClose={onClose}
        />,
      )
    })

    const portalOption = document.querySelector<HTMLButtonElement>("[data-testid='portal-option']")
    expect(portalOption).toBeTruthy()

    await act(async () => {
      portalOption!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    })

    const modalSurface = document.querySelector<HTMLElement>(".no-drag-region.fixed")
    expect(modalSurface).toBeTruthy()

    await act(async () => {
      modalSurface!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(onClose).not.toHaveBeenCalled()
  })

  test("does not dismiss when a click starts from modal content that unmounts before click", async () => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    const onClose = vi.fn()

    await act(async () => {
      root!.render(
        <ModalInternal
          item={{
            id: "settings",
            title: "Settings",
            content: ContentOption,
            CustomModalComponent: PlainModal,
            clickOutsideToDismiss: true,
          }}
          index={0}
          isTop
          isBottom
          onClose={onClose}
        />,
      )
    })

    const contentOption = document.querySelector<HTMLButtonElement>(
      "[data-testid='content-option']",
    )
    expect(contentOption).toBeTruthy()

    await act(async () => {
      contentOption!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    })

    const modalSurface = document.querySelector<HTMLElement>(".no-drag-region.fixed")
    expect(modalSurface).toBeTruthy()

    await act(async () => {
      modalSurface!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(onClose).not.toHaveBeenCalled()
  })

  test("still dismisses when a click starts from the outside modal surface", async () => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    const onClose = vi.fn()

    await act(async () => {
      root!.render(
        <ModalInternal
          item={{
            id: "settings",
            title: "Settings",
            content: PortalOption,
            CustomModalComponent: PlainModal,
            clickOutsideToDismiss: true,
          }}
          index={0}
          isTop
          isBottom
          onClose={onClose}
        />,
      )
    })

    const modalSurface = document.querySelector<HTMLElement>(".no-drag-region.fixed")
    expect(modalSurface).toBeTruthy()

    await act(async () => {
      modalSurface!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      modalSurface!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
