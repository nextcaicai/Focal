import type {
  TranslationBlockKind,
  TranslationBlockPair,
  TranslationDocumentDraft,
  TranslationGeneratorContentField,
} from "@follow/store/context"

const transparentContainerTags = new Set(["article", "main", "section", "div"])
const skippedTags = new Set(["script", "style", "template"])
const nonTranslatableTags = new Set([
  "audio",
  "canvas",
  "code",
  "iframe",
  "img",
  "picture",
  "pre",
  "svg",
  "table",
  "video",
])
const headingTags = new Set(["h1", "h2", "h3", "h4", "h5", "h6"])
const listTags = new Set(["ol", "ul"])

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")

const normalizeText = (value: string | null | undefined) =>
  value?.replaceAll(/\s+/g, " ").trim() ?? ""

const getBlockKind = (tagName: string): TranslationBlockKind => {
  if (headingTags.has(tagName)) return "heading"
  if (listTags.has(tagName)) return "list"
  if (tagName === "blockquote") return "quote"
  if (tagName === "p") return "paragraph"
  return "other"
}

const isElementNode = (node: Node): node is Element => node.nodeType === Node.ELEMENT_NODE
const isTextNode = (node: Node): node is Text => node.nodeType === Node.TEXT_NODE

const getElementTagName = (element: Element) => element.tagName.toLowerCase()

const hasDirectText = (element: Element) =>
  Array.from(element.childNodes).some(
    (child) => isTextNode(child) && !!normalizeText(child.textContent),
  )

const isNonTranslatableElement = (element: Element) =>
  element.closest(Array.from(nonTranslatableTags).join(",")) !== null

const isMeaningfulElement = (element: Element) => {
  const tagName = getElementTagName(element)
  if (skippedTags.has(tagName)) return false
  if (nonTranslatableTags.has(tagName)) return true
  return !!normalizeText(element.textContent)
}

const shouldFlattenContainer = (element: Element) => {
  const tagName = getElementTagName(element)
  if (!transparentContainerTags.has(tagName)) return false
  if (hasDirectText(element)) return false

  return Array.from(element.children).some(isMeaningfulElement)
}

const createBlock = ({
  id,
  kind,
  html,
  text,
  translatable,
}: {
  id: string
  kind: TranslationBlockKind
  html: string
  text: string
  translatable: boolean
}): TranslationBlockPair => ({
  id,
  kind,
  translatable,
  source: {
    html,
    text,
  },
})

export const createTranslationDocumentDraft = ({
  entryId,
  target,
  source,
}: {
  entryId: string
  target: TranslationGeneratorContentField
  source: string
}): TranslationDocumentDraft => {
  const parser = new DOMParser()
  const document = parser.parseFromString(source, "text/html")
  const blocks: TranslationBlockPair[] = []

  const nextId = () => `b${blocks.length + 1}`

  const collectNode = (node: Node) => {
    if (isTextNode(node)) {
      const text = normalizeText(node.textContent)
      if (!text) return

      blocks.push(
        createBlock({
          id: nextId(),
          kind: "paragraph",
          html: escapeHtml(text),
          text,
          translatable: true,
        }),
      )
      return
    }

    if (!isElementNode(node)) return

    const tagName = getElementTagName(node)
    if (skippedTags.has(tagName)) return

    if (shouldFlattenContainer(node)) {
      Array.from(node.childNodes).forEach(collectNode)
      return
    }

    const text = normalizeText(node.textContent)
    const translatable = !!text && !isNonTranslatableElement(node)

    if (!text && !nonTranslatableTags.has(tagName)) return

    blocks.push(
      createBlock({
        id: nextId(),
        kind: getBlockKind(tagName),
        html: node.outerHTML,
        text,
        translatable,
      }),
    )
  }

  Array.from(document.body.childNodes).forEach(collectNode)

  return {
    entryId,
    target,
    blockOrder: blocks.map((block) => block.id),
    blocks: Object.fromEntries(blocks.map((block) => [block.id, block])),
  }
}

export const getTranslatableBlocks = (draft: TranslationDocumentDraft) =>
  draft.blockOrder
    .map((id) => draft.blocks[id])
    .filter((block): block is TranslationBlockPair => !!block?.translatable)

export const createTranslationBlockBatches = (
  blocks: readonly TranslationBlockPair[],
  maxSourceLength: number,
) => {
  const batches: TranslationBlockPair[][] = []
  let currentBatch: TranslationBlockPair[] = []
  let currentLength = 0

  const pushCurrentBatch = () => {
    if (currentBatch.length === 0) return
    batches.push(currentBatch)
    currentBatch = []
    currentLength = 0
  }

  for (const block of blocks) {
    const nextLength = block.source.html.length + block.id.length + 16
    if (currentBatch.length > 0 && currentLength + nextLength > maxSourceLength) {
      pushCurrentBatch()
    }

    currentBatch.push(block)
    currentLength += nextLength
  }

  pushCurrentBatch()
  return batches
}
