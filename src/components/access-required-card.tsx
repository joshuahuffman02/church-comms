import Link from "next/link";

export function AccessRequiredCard({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="max-w-lg">
      <div className="card-float p-8 text-center">
        <div className="text-4xl mb-2">🔒</div>
        <h1 className="text-xl font-extrabold mb-1">{title}</h1>
        <p className="text-muted">{message}</p>
        <Link
          href="/this-week"
          className="mt-5 inline-block rounded-full bg-ink text-white px-5 py-2 text-sm font-semibold"
        >
          Back to the board
        </Link>
      </div>
    </div>
  );
}
