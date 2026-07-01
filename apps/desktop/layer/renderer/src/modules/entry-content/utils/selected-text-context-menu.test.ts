import { describe, expect, test } from "vitest"

import {
  getSelectedTextFromSelection,
  getSelectedTextFromShadowHost,
} from "./selected-text-context-menu"

const createSelection = ({
  text,
  anchorNode,
  focusNode = anchorNode,
  isCollapsed = false,
  rangeCount = 1,
}: {
  text: string
  anchorNode: Node | null
  focusNode?: Node | null
  isCollapsed?: boolean
  rangeCount?: number
}) =>
  ({
    anchorNode,
    focusNode,
    isCollapsed,
    rangeCount,
    toString: () => text,
  }) as unknown as Selection

describe("selected text context menu helpers", () => {
  test("returns trimmed selected text when the selection belongs to the root", () => {
    const root = document.createElement("div")
    const textNode = document.createTextNode("Selected text")
    root.append(textNode)

    expect(
      getSelectedTextFromSelection(
        root,
        createSelection({ text: "  Selected text  ", anchorNode: textNode }),
      ),
    ).toBe("Selected text")
  })

  test("ignores collapsed, empty, or outside selections", () => {
    const root = document.createElement("div")
    const insideNode = document.createTextNode("Inside")
    const outsideNode = document.createTextNode("Outside")
    root.append(insideNode)

    expect(
      getSelectedTextFromSelection(
        root,
        createSelection({ text: "Inside", anchorNode: insideNode, isCollapsed: true }),
      ),
    ).toBe("")
    expect(
      getSelectedTextFromSelection(root, createSelection({ text: "   ", anchorNode: insideNode })),
    ).toBe("")
    expect(
      getSelectedTextFromSelection(
        root,
        createSelection({ text: "Outside", anchorNode: outsideNode }),
      ),
    ).toBe("")
  })

  test("reads selected text from a shadow host", () => {
    const host = document.createElement("div")
    const shadowRoot = host.attachShadow({ mode: "open" })
    const textNode = document.createTextNode("Shadow text")
    shadowRoot.append(textNode)

    Object.defineProperty(shadowRoot, "getSelection", {
      configurable: true,
      value: () => createSelection({ text: "Shadow text", anchorNode: textNode }),
    })

    expect(getSelectedTextFromShadowHost(host)).toBe("Shadow text")
  })
})
