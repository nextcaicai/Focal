export interface TranslationStreamSegment {
  id: string
  html: string
}

const completeSegmentPattern = /<t\s+id=["']([^"']+)["']\s*>([\s\S]*?)<\/t>/gi

export class TranslationSegmentStreamParser {
  private buffer = ""
  private readonly processedIds = new Set<string>()

  push(chunk: string) {
    this.buffer += chunk

    const segments: TranslationStreamSegment[] = []
    let lastCompleteIndex = 0
    completeSegmentPattern.lastIndex = 0

    for (;;) {
      const match = completeSegmentPattern.exec(this.buffer)
      if (!match) break

      const id = match[1]?.trim()
      const html = match[2]?.trim()
      if (id && html && !this.processedIds.has(id)) {
        this.processedIds.add(id)
        segments.push({ id, html })
      }
      lastCompleteIndex = completeSegmentPattern.lastIndex
    }

    if (lastCompleteIndex > 0) {
      this.buffer = this.buffer.slice(lastCompleteIndex)
    }

    return segments
  }
}
