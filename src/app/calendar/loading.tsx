export default function CalendarLoading() {
  return (
    <div className="max-w-7xl animate-pulse space-y-6" aria-label="Loading Calendar">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <div className="h-3 w-28 rounded-full bg-slate-200" />
          <div className="h-8 w-44 rounded-full bg-slate-200" />
          <div className="h-4 w-80 max-w-full rounded-full bg-slate-200" />
        </div>
        <div className="h-11 w-72 max-w-full rounded-full bg-white/70" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="card-float h-24" />
        ))}
      </div>
      <div className="card-float h-[34rem]" />
    </div>
  );
}
