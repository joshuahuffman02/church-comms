import { db } from "@/lib/db";
import {
  calendarUrlToIcsUrl,
  configuredExternalCalendarSourceUrl,
  configuredExternalCalendarUrl,
} from "@/lib/external-calendar";

export type ExternalCalendarConfig = {
  sourceUrl: string | null;
  feedUrl: string | null;
  source: "setting" | "env" | "none";
};

export function normalizeExternalCalendarInput(input: FormDataEntryValue | null): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  const sourceUrl = raw.replace(/^webcal:\/\//i, "https://");
  const feedUrl = calendarUrlToIcsUrl(sourceUrl);
  let parsed: URL;
  try {
    parsed = new URL(feedUrl);
  } catch {
    throw new Error("Enter a valid calendar URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Use a calendar URL that starts with http://, https://, or webcal://.");
  }

  return sourceUrl;
}

export async function savedExternalCalendarSourceUrl(): Promise<string | null> {
  const setting = await db.setting.findUnique({
    where: { id: 1 },
    select: { externalCalendarUrl: true },
  });
  return setting?.externalCalendarUrl?.trim() || null;
}

export async function activeExternalCalendarConfig(): Promise<ExternalCalendarConfig> {
  const savedUrl = await savedExternalCalendarSourceUrl();
  if (savedUrl) {
    return {
      sourceUrl: savedUrl,
      feedUrl: calendarUrlToIcsUrl(savedUrl),
      source: "setting",
    };
  }

  const envFeedUrl = configuredExternalCalendarUrl();
  if (!envFeedUrl) {
    return { sourceUrl: null, feedUrl: null, source: "none" };
  }

  return {
    sourceUrl: configuredExternalCalendarSourceUrl() ?? envFeedUrl,
    feedUrl: envFeedUrl,
    source: "env",
  };
}

export async function activeExternalCalendarUrl(): Promise<string | null> {
  return (await activeExternalCalendarConfig()).feedUrl;
}
