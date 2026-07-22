export default function RoomsLoading() {
  return (
    <div className="max-w-6xl animate-pulse" aria-label="Loading room schedules">
      <div className="mb-6 h-8 w-44 rounded-xl bg-slate-200" />
      <div className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-20 rounded-2xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="mb-3 h-6 w-52 rounded-lg bg-slate-200" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-44 rounded-3xl border border-slate-200 bg-white" />
        <div className="h-44 rounded-3xl border border-slate-200 bg-white" />
      </div>
    </div>
  );
}
