export default function PipelineLoading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse" aria-label="Loading Production">
      <div className="card-float mb-5 p-6">
        <div className="h-4 w-48 rounded bg-slate-200" />
        <div className="mt-3 h-9 w-64 rounded bg-slate-200" />
        <div className="mt-3 h-4 max-w-3xl rounded bg-slate-100" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-24 rounded-2xl bg-slate-100" />)}
        </div>
      </div>
      <div className="card-float mb-5 h-36" />
      <div className="grid gap-4">
        {[0, 1].map((item) => <div key={item} className="card-float h-52" />)}
      </div>
    </div>
  );
}
