import { atMidnight, maxDate, parseDateInput, subDays } from "@/lib/engine/dates";

export type QuickItemField = "title" | "channelId" | "date" | "ownerId" | "assetLink" | "note";

export type QuickItemFormState = {
  status: "idle" | "error";
  message: string;
  fieldErrors: Partial<Record<QuickItemField, string>>;
};

export const QUICK_ITEM_INITIAL_STATE: QuickItemFormState = {
  status: "idle",
  message: "",
  fieldErrors: {},
};

export type QuickItemInput = {
  title: string;
  channelId: string;
  date: Date;
  ownerId: string | null;
  assetLink: string | null;
  note: string | null;
};

type QuickItemParseResult =
  | { ok: true; value: QuickItemInput }
  | { ok: false; state: QuickItemFormState };

function field(formData: FormData, key: QuickItemField): string {
  return String(formData.get(key) ?? "").trim();
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Validate the progressive-enhancement form on the server before any write. */
export function parseQuickItemForm(
  formData: FormData,
  today: Date = new Date(),
): QuickItemParseResult {
  const title = field(formData, "title");
  const channelId = field(formData, "channelId");
  const rawDate = field(formData, "date");
  const ownerId = field(formData, "ownerId");
  const assetLink = field(formData, "assetLink");
  const note = field(formData, "note");
  const date = parseDateInput(rawDate);
  const fieldErrors: QuickItemFormState["fieldErrors"] = {};

  if (!title) fieldErrors.title = "Describe what needs to happen.";
  else if (title.length > 180) fieldErrors.title = "Keep this to 180 characters or fewer.";
  if (!channelId) fieldErrors.channelId = "Choose where this communication belongs.";
  if (!date) fieldErrors.date = "Choose a valid live date.";
  else if (atMidnight(date) < atMidnight(today)) {
    fieldErrors.date = "Quick posts cannot be scheduled in the past.";
  }
  if (assetLink && !isWebUrl(assetLink)) {
    fieldErrors.assetLink = "Use a complete http:// or https:// link.";
  }
  if (note.length > 1_000) fieldErrors.note = "Keep instructions to 1,000 characters or fewer.";

  if (Object.keys(fieldErrors).length > 0 || !date) {
    return {
      ok: false,
      state: {
        status: "error",
        message: "Review the highlighted fields and try again.",
        fieldErrors,
      },
    };
  }

  return {
    ok: true,
    value: {
      title,
      channelId,
      date,
      ownerId: ownerId || null,
      assetLink: assetLink || null,
      note: note || null,
    },
  };
}

/** A newly-created task can be due today, but should never begin overdue. */
export function quickItemProductionDueAt(
  liveDate: Date,
  productionLeadDays: number,
  createdAt: Date = new Date(),
): Date {
  return maxDate(atMidnight(createdAt), subDays(liveDate, productionLeadDays));
}
