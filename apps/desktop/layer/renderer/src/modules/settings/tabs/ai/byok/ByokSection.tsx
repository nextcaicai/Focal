import { Button } from "@follow/components/ui/button/index.js"
import { Label } from "@follow/components/ui/label/index.jsx"
import { Switch } from "@follow/components/ui/switch/index.jsx"
import type { UserByokProviderConfig } from "@follow/shared/settings/interface"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { getAISettings, setAISetting, useAISettingValue } from "~/atoms/settings/ai"
import { useDialog, useModalStack } from "~/components/ui/modal/stacked/hooks"

import { ByokProcessingSection } from "../background-processing"
import { ByokProviderItem } from "./ByokProviderItem"
import { ByokProviderModalContent } from "./ByokProviderModalContent"

export const ByokSection = () => {
  const { t } = useTranslation("ai")
  const aiSettings = useAISettingValue()
  const byok = aiSettings.byok ?? { enabled: false, providers: [] }
  const { present } = useModalStack()
  const { ask } = useDialog()

  const handleToggleEnabled = (enabled: boolean) => {
    setAISetting("byok", {
      ...byok,
      enabled,
    })
  }

  const handleAddProvider = () => {
    const currentByok = getAISettings().byok ?? { enabled: false, providers: [] }
    const configuredProviders = currentByok.providers.map((p) => p.provider)

    present({
      title: t("byok.providers.add_title"),
      content: ({ dismiss }: { dismiss: () => void }) => (
        <ByokProviderModalContent
          provider={null}
          configuredProviders={configuredProviders}
          existingProviders={currentByok.providers}
          onSave={(provider) => {
            const updatedByok = getAISettings().byok ?? { enabled: false, providers: [] }
            setAISetting("byok", {
              ...updatedByok,
              providers: [provider],
            })
            toast.success(t("byok.providers.added"))
            dismiss()
          }}
          onCancel={dismiss}
        />
      ),
    })
  }

  const handleEditProvider = (index: number, provider: UserByokProviderConfig) => {
    const currentByok = getAISettings().byok ?? { enabled: false, providers: [] }
    // Exclude the current provider being edited from configured list (for any legacy filtering)
    const configuredProviders = currentByok.providers
      .filter((_, i) => i !== index)
      .map((p) => p.provider)

    present({
      title: t("byok.providers.edit_title"),
      content: ({ dismiss }: { dismiss: () => void }) => (
        <ByokProviderModalContent
          provider={provider}
          configuredProviders={configuredProviders}
          existingProviders={currentByok.providers}
          onSave={(updatedProvider) => {
            const updatedByok = getAISettings().byok ?? { enabled: false, providers: [] }
            // Always result in a single active provider after edit (supports "switch via edit" UX)
            // Previous other providers' keys were already available for restore inside the modal via existingProviders.
            setAISetting("byok", {
              ...updatedByok,
              providers: [updatedProvider],
            })
            toast.success(t("byok.providers.updated"))
            dismiss()
          }}
          onCancel={dismiss}
        />
      ),
    })
  }

  const handleDeleteProvider = async (index: number) => {
    const confirmed = await ask({
      title: t("byok.providers.delete_title"),
      message: t("byok.providers.delete_message"),
      confirmText: t("words.delete", { ns: "common" }),
      cancelText: t("words.cancel", { ns: "common" }),
      variant: "danger",
    })

    if (confirmed) {
      const currentByok = getAISettings().byok ?? { enabled: false, providers: [] }
      const updatedProviders = currentByok.providers.filter((_, i) => i !== index)
      setAISetting("byok", {
        ...currentByok,
        providers: updatedProviders,
      })
      toast.success(t("byok.providers.deleted"))
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label className="text-sm font-medium text-text">{t("byok.enabled")}</Label>
            <div className="text-xs text-text-secondary">{t("byok.description")}</div>
          </div>
          <Switch checked={byok.enabled} onCheckedChange={handleToggleEnabled} />
        </div>
      </div>

      {byok.enabled && (
        <>
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-text">{t("byok.providers.title")}</Label>
          </div>

          {byok.providers.length === 0 && (
            <div className="py-8 text-center">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-fill-secondary">
                <i className="i-focal-key-2 size-6 text-text" />
              </div>
              <h4 className="mb-1 text-sm font-medium text-text">
                {t("byok.providers.empty.title")}
              </h4>
              <p className="text-xs text-text-secondary">{t("byok.providers.empty.description")}</p>
              <Button
                variant="outline"
                size="sm"
                buttonClassName="mt-4"
                onClick={handleAddProvider}
              >
                <i className="i-focal-add mr-2 size-4" />
                {t("byok.providers.add")}
              </Button>
            </div>
          )}

          <div className="!mt-2 space-y-4">
            {byok.providers.map((provider, index) => (
              <ByokProviderItem
                key={provider.provider}
                provider={provider}
                onDelete={() => handleDeleteProvider(index)}
                onEdit={() => handleEditProvider(index, provider)}
              />
            ))}
          </div>

          <ByokProcessingSection />
        </>
      )}
    </div>
  )
}
