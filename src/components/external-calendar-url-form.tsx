import { saveExternalCalendarUrl } from "@/actions/calendar-settings";

type Props = {
  currentUrl: string | null;
  className?: string;
  buttonLabel?: string;
};

export function ExternalCalendarUrlForm({
  currentUrl,
  className = "",
  buttonLabel = "Save calendar URL",
}: Props) {
  return (
    <form action={saveExternalCalendarUrl} className={`grid gap-3 ${className}`}>
      <label className="grid gap-1">
        <span className="text-sm font-semibold text-muted">Calendar iCal URL</span>
        <input
          name="externalCalendarUrl"
          type="url"
          inputMode="url"
          autoComplete="url"
          defaultValue={currentUrl ?? ""}
          placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
          className="w-full rounded-2xl border px-4 py-2 text-sm"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white">
          {buttonLabel}
        </button>
        {currentUrl && (
          <button
            type="submit"
            name="intent"
            value="clear"
            formNoValidate
            className="rounded-full border px-4 py-2 text-sm font-semibold text-muted hover:bg-sky-bg"
          >
            Clear
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        Use Google Calendar&apos;s secret iCal address, a public <code className="font-mono">.ics</code> URL,
        or a <code className="font-mono">webcal://</code> link. This stays read-only.
      </p>
    </form>
  );
}
