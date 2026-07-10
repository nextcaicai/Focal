import { FeedViewType } from "@follow/constants"
import { isOnboardingFeedUrl } from "@follow/store/constants/onboarding"
import { isPodcastSubscriptionFeed } from "@follow/utils/url-for-audio"
import { isSocialSubscriptionFeed } from "@follow/utils/url-for-social"
import { isYouTubeSubscriptionFeed } from "@follow/utils/url-for-video"
import { capitalizeFirstLetter, parseUrl } from "@follow/utils/utils"

import { getFeedById } from "../feed/getter"
import type { SubscriptionModel } from "./types"

/**
 * Views we force from feed URL signals (not free-form user folders like Pictures).
 * Includes Videos / Audios / SocialMedia.
 */
const isStrongInferredView = (view: FeedViewType) =>
  view === FeedViewType.Videos || view === FeedViewType.Audios || view === FeedViewType.SocialMedia

export const inferSubscriptionViewFromFeed = (
  feed: { url?: string | null; siteUrl?: string | null } | null | undefined,
): FeedViewType => {
  if (feed && isYouTubeSubscriptionFeed(feed)) {
    return FeedViewType.Videos
  }

  if (feed && isPodcastSubscriptionFeed(feed)) {
    return FeedViewType.Audios
  }

  if (feed && isSocialSubscriptionFeed(feed)) {
    return FeedViewType.SocialMedia
  }

  return FeedViewType.Articles
}

/**
 * Correct misclassified subscription views after hydrate / feed identity changes.
 * Strong inference (YouTube → Videos, podcast → Audios, X/social → SocialMedia) wins.
 * Subscriptions stuck on those views without matching feed signals are demoted.
 */
export const getCorrectedSubscriptionView = (subscription: SubscriptionModel): FeedViewType => {
  if (subscription.type !== "feed" || !subscription.feedId) {
    return subscription.view
  }

  const feed = getFeedById(subscription.feedId)
  if (!feed) {
    return subscription.view
  }

  const inferredView = inferSubscriptionViewFromFeed(feed)
  if (isStrongInferredView(inferredView)) {
    return inferredView
  }

  // Demote wrong Videos/Audios/SocialMedia when feed is not that type.
  if (isStrongInferredView(subscription.view)) {
    return inferredView
  }

  return subscription.view
}

export const getInboxStoreId = (inboxId: string) => `inbox/${inboxId}`

export const getSubscriptionStoreId = (subscription: SubscriptionModel) => {
  if (subscription.feedId) return subscription.feedId
  if (subscription.listId) return subscription.listId
  if (subscription.inboxId) return getInboxStoreId(subscription.inboxId)
  throw new Error("Invalid subscription")
}

export const getSubscriptionDBId = (subscription: SubscriptionModel) => {
  if (subscription.feedId && subscription.type === "feed") {
    return `${subscription.type}/${subscription.feedId}`
  }
  if (subscription.listId && subscription.type === "list") {
    return `${subscription.type}/${subscription.listId}`
  }
  if (subscription.inboxId && subscription.type === "inbox") {
    return `${subscription.type}/${subscription.inboxId}`
  }
  throw new Error("Invalid subscription")
}

export const getDefaultCategory = (subscription?: SubscriptionModel) => {
  if (!subscription) return null
  const { feedId } = subscription
  if (!feedId) return null

  const feed = getFeedById(feedId)
  if (!feed) return null
  const isOnboardingFeed = isOnboardingFeedUrl(feed.url)
  if (isOnboardingFeed) return "Onboarding Feeds"
  const siteUrl = getFeedById(feedId)?.siteUrl
  if (!siteUrl) return null
  const parsed = parseUrl(siteUrl)
  return parsed?.domain ? capitalizeFirstLetter(parsed.domain) : siteUrl
}
