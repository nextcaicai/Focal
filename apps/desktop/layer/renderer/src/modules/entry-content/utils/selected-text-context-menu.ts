type SelectionRoot = Pick<Node, "contains">
type ShadowSelectionProvider = {
  getSelection?: () => Selection | null
}

export const getSelectedTextFromSelection = (
  root: SelectionRoot,
  selection: Selection | null | undefined,
) => {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return ""
  }

  const selectedText = selection.toString().trim()
  if (!selectedText) {
    return ""
  }

  const hasSelectionNodeInRoot =
    (!!selection.anchorNode && root.contains(selection.anchorNode)) ||
    (!!selection.focusNode && root.contains(selection.focusNode))

  return hasSelectionNodeInRoot ? selectedText : ""
}

export const getSelectedTextFromDocumentSelection = (root: SelectionRoot) => {
  return getSelectedTextFromSelection(root, window.getSelection())
}

export const getSelectedTextFromShadowHost = (host: HTMLElement) => {
  const { shadowRoot } = host
  if (!shadowRoot) {
    return ""
  }

  const selection =
    (shadowRoot as ShadowRoot & ShadowSelectionProvider).getSelection?.() ?? window.getSelection()
  return getSelectedTextFromSelection(shadowRoot, selection)
}
