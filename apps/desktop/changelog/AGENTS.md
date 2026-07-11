# AGENTS.md — Desktop changelog

Guidance for writing and maintaining app release notes under `apps/desktop/changelog/`.

## Audience and voice

- **Write for user experience, not for git history.** Describe what the user can do, see, or notice — not PR titles, package paths, or commit subjects.
- Prefer product language: “全库搜索”, “语义索引进度”, “旧标签离线整理”.
- Avoid engineer jargon in the published notes: `feat(…)`, `refactor(…)`, file names, hook names, “store”, “renderer”, internal axis codes unless the product already exposes them.
- Commits are **source material** only. Merge related commits into one user-facing bullet when they serve the same outcome.
- Keep bullets concrete and scannable; one outcome per bullet when possible.

## Structure — follow templates

**Always start from `templates/`** for section titles and language-specific heading style.

| File                  | Role                                                                    |
| --------------------- | ----------------------------------------------------------------------- |
| `templates/{lang}.md` | Canonical skeleton and section headings per language                    |
| `next/{lang}.md`      | In-progress draft for the **next** release (`NEXT_VERSION` placeholder) |
| `{x.y.z}/{lang}.md`   | Frozen notes for a shipped version                                      |

Required section order (match templates; leave a section empty only if truly nothing to say, or omit empty sections only when consistent with recent shipped notes):

1. **New Features** / 新功能 / 新機能 / Nouvelles fonctionnalités
2. **Improvements** / 改进 / 改進 / 改善 / Améliorations
3. **Bug Fixes** / 问题修复 / 問題修復 / 修正 / Corrections
4. **Thanks** / 致谢 / 致謝 / 謝辞 / Remerciements

Languages (must stay in sync for each release): `en`, `zh-CN`, `zh-TW`, `ja`, `fr-FR` — see `constants.ts`.

Title line examples:

- en: `# What's new in vNEXT_VERSION` → replace with `v0.2.6` when shipping
- zh-CN: `# vNEXT_VERSION 更新内容`
- Use the same pattern as the latest shipped folder (e.g. `0.2.6/`) for consistency.

## Workflow

1. Draft ongoing work in `next/*.md` using `NEXT_VERSION` as in templates.
2. On version bump, `scripts/apply-changelog.ts` renames `next/` → `{version}/` and substitutes `NEXT_VERSION`.
3. Do not invent a version directory by hand unless intentionally backfilling; if you write `0.x.y/` directly, keep all five languages and do not leave a conflicting half-written `next/`.

## Checklist before finishing a release note

- [ ] Copied structure from `templates/` (or mirrored the latest shipped version’s section headings).
- [ ] All five languages present and roughly equivalent in meaning.
- [ ] Bullets describe user impact; no commit hashes or raw commit subjects.
- [ ] Related commits collapsed into fewer, clearer bullets.
- [ ] Thanks section present (templates provide a default line).
