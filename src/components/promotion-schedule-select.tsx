import { SCHEDULE_PRESETS } from "@/lib/schedule-presets";

export function PromotionScheduleSelect({ defaultValue = "" }: { defaultValue?: string | null }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor="schedulePreset" className="text-sm font-semibold text-ink">
        Promotion timing
      </label>
      <select
        id="schedulePreset"
        name="schedulePreset"
        defaultValue={defaultValue ?? ""}
        className="min-h-11 rounded-2xl border px-4 py-2"
      >
        <option value="">Automatic (recommended)</option>
        {SCHEDULE_PRESETS.map((preset) => (
          <option key={preset.key} value={preset.key}>{preset.label}</option>
        ))}
      </select>
      <p className="text-xs leading-relaxed text-muted">
        Automatic keeps regular Sunday/Wednesday Rise and Thrive gatherings to their final week.
        Registration and special events keep the normal multi-week schedule. Monthly spotlights run
        only inside their named month.
      </p>
    </div>
  );
}
