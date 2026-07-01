import { useOnce } from "@follow/hooks"
import { nextFrame } from "@follow/utils/dom"
import { getStorageNS } from "@follow/utils/ns"
import { repository } from "@pkg"
import type { FC } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Trans, useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useServerConfigs } from "~/atoms/server-configs"
import { Markdown } from "~/components/ui/markdown/Markdown"
import { PeekModal } from "~/components/ui/modal/inspire/PeekModal"
import { useModalStack } from "~/components/ui/modal/stacked/hooks"
import { Paper } from "~/components/ui/paper"
import { DebugRegistry } from "~/modules/debug/registry"

import { CHANGELOG_LANGUAGES } from "../../../../../changelog/constants"
import type { ChangelogContents } from "./changelog"
import { hasChangelogContent, resolveChangelogContent } from "./changelog"
import { linkifyChangelog } from "./utils"

const devChangelogModules = import.meta.glob("../../../../../changelog/next/*.md", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>

const loadDevChangelogContents = async (): Promise<ChangelogContents> => {
  const entries = await Promise.all(
    CHANGELOG_LANGUAGES.map(async (lang) => {
      const loader = Object.entries(devChangelogModules).find(([path]) =>
        path.endsWith(`/next/${lang}.md`),
      )?.[1]

      if (!loader) {
        return [lang, ""] as const
      }

      return [lang, await loader()] as const
    }),
  )

  return Object.fromEntries(entries)
}

const bundledChangelogAvailable = hasChangelogContent(CHANGELOG_CONTENT)

const AppNotificationContainer: FC = () => {
  const { present } = useModalStack()
  const { t } = useTranslation()

  const serverConfigs = useServerConfigs()

  const onceRef = useRef(false)
  useEffect(() => {
    if (onceRef.current) return

    if (!serverConfigs?.ANNOUNCEMENT) return
    onceRef.current = true
    try {
      const payload = JSON.parse(serverConfigs.ANNOUNCEMENT) as {
        title: string
        id: number | string
        content: string
      }

      if (payload.id) {
        const storeKey = getStorageNS(`announcement-${payload.id}`)

        const showPrevious = localStorage.getItem(storeKey)
        if (showPrevious) {
          return
        }
        localStorage.setItem(storeKey, payload.id.toString())
      }

      toast.info(payload.title, {
        description: <Markdown className="text-sm">{payload.content}</Markdown>,
        duration: Infinity,
        closeButton: true,
      })
    } catch (e) {
      console.error(e)
    }
  }, [serverConfigs?.ANNOUNCEMENT])

  useOnce(() => {
    const toaster = () => {
      toast.success("", {
        description: (
          <div className="font-medium text-text">
            <Trans
              ns="app"
              i18nKey="upgrade.app_upgraded_description"
              values={{ version: APP_VERSION }}
              components={{
                Link: (
                  <a
                    href={`${repository.url}/releases/tag/v${APP_VERSION}`}
                    target="_blank"
                    rel="noreferrer"
                  />
                ),
              }}
            />
          </div>
        ),
        closeButton: true,
        duration: 5000,
        action:
          import.meta.env.DEV || bundledChangelogAvailable
            ? {
                label: t("upgrade.whats_new"),
                onClick: () => {
                  nextFrame(() => {
                    present({
                      clickOutsideToDismiss: true,
                      title: t("upgrade.whats_new"),
                      autoFocus: false,
                      modalClassName:
                        "relative mx-auto mt-[10vh] scrollbar-none max-w-full overflow-auto px-2 lg:max-w-[65rem] lg:p-0",

                      CustomModalComponent: ({ children }) => {
                        return <PeekModal>{children}</PeekModal>
                      },
                      content: () => <Changelog />,
                      overlay: true,
                    })
                  })
                },
              }
            : undefined,
      })
    }
    if (window.__app_is_upgraded__) {
      setTimeout(toaster)
    }

    DebugRegistry.add("App Upgraded Toast", toaster)
  })

  return null
}
export default AppNotificationContainer

const Changelog: FC = () => {
  const { i18n } = useTranslation()
  const [contents, setContents] = useState<ChangelogContents>(
    import.meta.env.DEV ? {} : CHANGELOG_CONTENT,
  )

  useEffect(() => {
    if (!import.meta.env.DEV) return

    let cancelled = false
    void loadDevChangelogContents().then((loaded) => {
      if (!cancelled) {
        setContents(loaded)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const markdown = useMemo(() => {
    const content = resolveChangelogContent(contents, i18n.language)
    return linkifyChangelog(content, repository.url)
  }, [contents, i18n.language])

  return (
    <Paper>
      <Markdown className="mt-8 w-full max-w-full">{markdown}</Markdown>
    </Paper>
  )
}
