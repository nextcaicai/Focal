import {
  SimpleIconsCubox,
  SimpleIconsObsidian,
  SimpleIconsOutline,
} from "@follow/components/ui/platform-icon/icons.js"
import { IN_ELECTRON } from "@follow/shared/constants"
import type { MouseEvent as ReactMouseEvent } from "react"
import { useCallback } from "react"
import { useTranslation } from "react-i18next"

import { MenuItemText, useShowContextMenu } from "~/atoms/context-menu"
import { useIntegrationSettingKey } from "~/atoms/settings/integration"
import { COMMAND_ID } from "~/modules/command/commands/id"
import { useRunCommandFn } from "~/modules/command/hooks/use-command"

type ContextMenuEvent = MouseEvent | ReactMouseEvent<HTMLElement>

export const useSelectedTextIntegrationContextMenu = ({ entryId }: { entryId: string }) => {
  const { t } = useTranslation()
  const showContextMenu = useShowContextMenu()
  const runCmdFn = useRunCommandFn()

  const enableObsidian = useIntegrationSettingKey("enableObsidian")
  const obsidianVaultPath = useIntegrationSettingKey("obsidianVaultPath")
  const isObsidianAvailable = IN_ELECTRON && enableObsidian && !!obsidianVaultPath

  const enableOutline = useIntegrationSettingKey("enableOutline")
  const outlineEndpoint = useIntegrationSettingKey("outlineEndpoint")
  const outlineToken = useIntegrationSettingKey("outlineToken")
  const outlineCollection = useIntegrationSettingKey("outlineCollection")
  const isOutlineAvailable =
    IN_ELECTRON && enableOutline && !!outlineEndpoint && !!outlineToken && !!outlineCollection

  const enableCubox = useIntegrationSettingKey("enableCubox")
  const cuboxToken = useIntegrationSettingKey("cuboxToken")
  const enableCuboxAutoMemo = useIntegrationSettingKey("enableCuboxAutoMemo")
  const isCuboxMemoAvailable = enableCubox && !!cuboxToken && enableCuboxAutoMemo

  return useCallback(
    (event: ContextMenuEvent, selectedText: string) => {
      const normalizedSelectedText = selectedText.trim()
      if (!normalizedSelectedText) {
        return false
      }

      const menuItems = [
        isObsidianAvailable &&
          new MenuItemText({
            label: t("entry_actions.save_to_obsidian"),
            icon: <SimpleIconsObsidian />,
            click: runCmdFn(COMMAND_ID.integration.saveToObsidian, [
              { entryId, selectedText: normalizedSelectedText },
            ]),
          }),
        isOutlineAvailable &&
          new MenuItemText({
            label: t("entry_actions.save_to_outline"),
            icon: <SimpleIconsOutline />,
            click: runCmdFn(COMMAND_ID.integration.saveToOutline, [
              { entryId, selectedText: normalizedSelectedText },
            ]),
          }),
        isCuboxMemoAvailable &&
          new MenuItemText({
            label: t("entry_actions.save_to_cubox"),
            icon: <SimpleIconsCubox />,
            click: runCmdFn(COMMAND_ID.integration.saveToCubox, [
              { entryId, selectedText: normalizedSelectedText },
            ]),
          }),
      ]

      const enabledMenuItems = menuItems.filter((item) => item instanceof MenuItemText)
      if (enabledMenuItems.length === 0) {
        return false
      }

      event.preventDefault()
      event.stopPropagation()

      void showContextMenu(enabledMenuItems, event)
      return true
    },
    [
      entryId,
      isCuboxMemoAvailable,
      isObsidianAvailable,
      isOutlineAvailable,
      runCmdFn,
      showContextMenu,
      t,
    ],
  )
}
