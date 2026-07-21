export default function EventsLoading() {
  return (
    <div className="max-w-6xl animate-pulse" aria-label="Loading events">
      <div className="h-3 w-32 rounded-full bg-slate-200" />
      <div className="mt-3 h-9 w-48 rounded-xl bg-slate-200" />
      <div className="mt-3 h-4 w-2/3 rounded-full bg-slate-200" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className="h-24 rounded-2xl bg-white/60" />)}
      </div>
      <div className="mt-5 h-16 rounded-3xl bg-white/60" />
      <div className="mt-5 h-28 rounded-3xl bg-white/60" />
      <div className="mt-5 grid gap-3">
        {[0, 1, 2].map((item) => <div key={item} className="h-32 rounded-3xl bg-white/60" />)}
      </div>
    </div>
  );
}
