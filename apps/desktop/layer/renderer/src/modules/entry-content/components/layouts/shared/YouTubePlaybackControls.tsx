import { Switch } from "@follow/components/ui/switch/index.jsx"

interface YouTubePlaybackControlsProps {
  isPlayerPinned: boolean
  autoScrollActiveCue: boolean
  highlightActiveCue: boolean
  labels: {
    pinPlayer: string
    autoScroll: string
    highlightCurrentLine: string
  }
  onPlayerPinnedChange: (checked: boolean) => void
  onAutoScrollActiveCueChange: (checked: boolean) => void
  onHighlightActiveCueChange: (checked: boolean) => void
}

export const YouTubePlaybackControls: React.FC<YouTubePlaybackControlsProps> = ({
  isPlayerPinned,
  autoScrollActiveCue,
  highlightActiveCue,
  labels,
  onPlayerPinnedChange,
  onAutoScrollActiveCueChange,
  onHighlightActiveCueChange,
}) => (
  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-0.5 pt-2 text-sm font-medium text-text-secondary">
    <YouTubePlaybackControl
      label={labels.pinPlayer}
      checked={isPlayerPinned}
      onCheckedChange={onPlayerPinnedChange}
    />
    <YouTubePlaybackControl
      label={labels.autoScroll}
      checked={autoScrollActiveCue}
      onCheckedChange={onAutoScrollActiveCueChange}
    />
    <YouTubePlaybackControl
      label={labels.highlightCurrentLine}
      checked={highlightActiveCue}
      onCheckedChange={onHighlightActiveCueChange}
    />
  </div>
)

const YouTubePlaybackControl: React.FC<{
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}> = ({ label, checked, onCheckedChange }) => (
  <div className="flex items-center gap-2 whitespace-nowrap">
    <span>{label}</span>
    <Switch
      aria-label={label}
      size="sm"
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="!bg-fill-vibrant data-[checked]:!bg-fill-vibrant-secondary [&_[data-slot=switch-thumb]]:!bg-white [&_[data-slot=switch-thumb]]:shadow-sm"
    />
  </div>
)
