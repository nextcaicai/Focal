import { Button } from "@follow/components/ui/button/index.js"
import { LOCAL_RSS_MODE } from "@follow/shared/constants"

import { FOCAL_TAGLINE, FocalLogo, FocalWordmark } from "~/modules/brand/FocalLogo"

export function DownloadPage() {
  const openDownloadPage = () => {
    // Standalone builds do not use an official cloud download page.
  }

  const handleMobileDownload = () => {
    if (LOCAL_RSS_MODE) return

    openDownloadPage()
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      {/* Logo Section */}
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-4 flex items-center space-x-4">
          <FocalLogo className="size-12 rounded-2xl" />
          <FocalWordmark className="text-2xl" />
        </div>
        <p className="text-base text-text-secondary">{FOCAL_TAGLINE}</p>
      </div>

      {/* Main Content */}
      <div className="w-full max-w-xs space-y-6 text-center">
        <div>
          <h1 className="mb-3 text-xl font-semibold text-text">
            {LOCAL_RSS_MODE ? "Local RSS desktop app" : "Download Focal"}
          </h1>
          <p className="text-sm text-text-secondary">
            {LOCAL_RSS_MODE
              ? "This standalone build does not use official cloud download services."
              : "Focal is currently available as a macOS desktop app."}
          </p>
        </div>

        {/* Download Button */}
        <Button disabled={LOCAL_RSS_MODE} onClick={handleMobileDownload}>
          <i className="i-focal-download-2 mr-2 text-lg" />
          <span>{LOCAL_RSS_MODE ? "Download service disabled" : "Go to Download Page"}</span>
        </Button>

        {/* Hint */}
        <p className="text-xs text-text-tertiary">Available for macOS</p>
      </div>
    </div>
  )
}

export default DownloadPage
