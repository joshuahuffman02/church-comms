"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Clock3, Save, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import {
  submitIntakeWithState,
  type IntakeFormState,
} from "@/actions/intake";
import {
  buildIntakePlanPreview,
  type IntakePreviewChannel,
} from "@/lib/smart-workflow";
import {
  parseLocalDraft,
  serializeLocalDraft,
} from "@/lib/local-draft";

const DRAFT_KEY = "church-comms:intake-draft:v1";

type IntakeDraft = {
  requesterName: string;
  requesterEmail: string;
  ministry: string;
  title: string;
  description: string;
  whoIsItFor: string;
  eventStart: string;
  location: string;
  needsRegistration: boolean;
  registrationUrl: string;
  cost: string;
  registrationClosesAt: string;
  nextStep: string;
  notes: string;
};

export type RecentRequestTemplate = {
  id: string;
  title: string;
  description: string;
  ministry: string;
  whoIsItFor: string;
  eventStart: string;
  location: string;
  needsRegistration: boolean;
  registrationUrl: string;
  cost: string;
  registrationClosesAt: string;
  nextStep: string;
};

const EMPTY_DRAFT: IntakeDraft = {
  requesterName: "",
  requesterEmail: "",
  ministry: "",
  title: "",
  description: "",
  whoIsItFor: "whole_church",
  eventStart: "",
  location: "",
  needsRegistration: false,
  registrationUrl: "",
  cost: "",
  registrationClosesAt: "",
  nextStep: "",
  notes: "",
};

const INITIAL_STATE: IntakeFormState = { message: "" };

function hasDraftContent(draft: IntakeDraft): boolean {
  return Object.entries(draft).some(([key, value]) => {
    if (key === "whoIsItFor") return value !== "whole_church";
    if (typeof value === "boolean") return value;
    return typeof value === "string" && value.trim().length > 0;
  });
}

function friendlyDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "Date not chosen";
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString(
    undefined,
    { weekday: "long", month: "long", day: "numeric", year: "numeric" },
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="text-xs font-bold text-rose-700">{message}</p>;
}

export function GuidedIntakeForm({
  user,
  canImport,
  channels,
  recentRequests,
}: {
  user: { name: string | null; email: string } | null;
  canImport: boolean;
  channels: IntakePreviewChannel[];
  recentRequests: RecentRequestTemplate[];
}) {
  const [serverState, formAction, pending] = useActionState(submitIntakeWithState, INITIAL_STATE);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<IntakeDraft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [restored, setRestored] = useState(false);
  const [clientErrors, setClientErrors] = useState<NonNullable<IntakeFormState["fieldErrors"]>>({});
  const [visibleServerErrors, setVisibleServerErrors] = useState<NonNullable<IntakeFormState["fieldErrors"]>>({});
  const [visibleServerMessage, setVisibleServerMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [confirmationError, setConfirmationError] = useState(false);
  const draftRef = useRef(draft);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(DRAFT_KEY);
        if (saved) {
          const parsed = parseLocalDraft<IntakeDraft>(saved);
          if (parsed.status === "ready") {
            setDraft({ ...EMPTY_DRAFT, ...parsed.data });
            setRestored(true);
          } else {
            window.localStorage.removeItem(DRAFT_KEY);
          }
        }
      } catch {
        // A blocked or malformed local draft should never block the intake form.
      } finally {
        setHydrated(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (hasDraftContent(draft)) {
        window.localStorage.setItem(DRAFT_KEY, serializeLocalDraft(draft));
      } else {
        window.localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      // Private browsing or a storage policy can disable localStorage.
    }
  }, [draft, hydrated]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!pending) return;
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // The redirect remains the source of truth when storage is unavailable.
    }
  }, [pending]);

  useEffect(() => {
    if (!serverState.fieldErrors || Object.keys(serverState.fieldErrors).length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      setStep(0);
      setVisibleServerErrors(serverState.fieldErrors ?? {});
      setVisibleServerMessage(serverState.message);
    });
    try {
      window.localStorage.setItem(DRAFT_KEY, serializeLocalDraft(draftRef.current));
    } catch {
      // The live React state still preserves the form values.
    }
    return () => window.cancelAnimationFrame(frame);
  }, [serverState]);

  const update = <K extends keyof IntakeDraft>(key: K, value: IntakeDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (key === "title" || key === "requesterEmail" || key === "eventStart") {
      const errorKey = key as keyof NonNullable<IntakeFormState["fieldErrors"]>;
      setClientErrors((current) => {
        const next = { ...current };
        delete next[errorKey];
        return next;
      });
      setVisibleServerErrors((current) => {
        const next = { ...current };
        delete next[errorKey];
        return next;
      });
      setVisibleServerMessage("");
    }
  };

  const plan = useMemo(
    () =>
      buildIntakePlanPreview({
        audience: draft.whoIsItFor,
        eventDate: draft.eventStart,
        registrationCloseDate: draft.registrationClosesAt,
        needsRegistration: draft.needsRegistration,
        channels,
      }),
    [
      channels,
      draft.eventStart,
      draft.needsRegistration,
      draft.registrationClosesAt,
      draft.whoIsItFor,
    ],
  );

  const duplicate = useMemo(
    () =>
      recentRequests.find(
        (request) =>
          request.title.trim().toLowerCase() === draft.title.trim().toLowerCase() &&
          request.eventStart === draft.eventStart,
      ),
    [draft.eventStart, draft.title, recentRequests],
  );

  const errors = { ...clientErrors, ...visibleServerErrors };
  const draftHasContent = hasDraftContent(draft);

  function validateBasics(): boolean {
    const formData = formRef.current ? new FormData(formRef.current) : null;
    const requesterEmail = user
      ? user.email
      : String(formData?.get("requesterEmail") ?? draft.requesterEmail).trim();
    const title = String(formData?.get("title") ?? draft.title).trim();
    const eventStart = String(formData?.get("eventStart") ?? draft.eventStart).trim();

    // Read the live controls as well as React state so password managers,
    // browser autofill, and accessibility tools can advance the guided flow.
    setDraft((current) => ({
      ...current,
      requesterEmail: user ? current.requesterEmail : requesterEmail,
      title,
      eventStart,
    }));

    const nextErrors: NonNullable<IntakeFormState["fieldErrors"]> = {};
    if (!user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
      nextErrors.requesterEmail = "Enter a valid email address.";
    }
    if (!title) nextErrors.title = "Add a short event title.";
    if (!eventStart) nextErrors.eventStart = "Choose the event date.";
    setClientErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setStep(0);
      window.requestAnimationFrame(() => {
        const first = document.querySelector<HTMLElement>("[aria-invalid='true']");
        first?.focus();
      });
      return false;
    }
    return true;
  }

  function nextStep() {
    if (step === 0 && !validateBasics()) return;
    setStep((current) => Math.min(2, current + 1));
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function applyTemplate(template: RecentRequestTemplate) {
    setDraft((current) => ({
      ...current,
      ministry: template.ministry,
      title: template.title,
      description: template.description,
      whoIsItFor: template.whoIsItFor,
      location: template.location,
      needsRegistration: template.needsRegistration,
      registrationUrl: template.registrationUrl,
      cost: template.cost,
      registrationClosesAt: "",
      nextStep: template.nextStep,
    }));
    setRestored(true);
  }

  function clearDraft() {
    setDraft(EMPTY_DRAFT);
    setRestored(false);
    setClientErrors({});
    setVisibleServerErrors({});
    setVisibleServerMessage("");
    setConfirmed(false);
    setConfirmationError(false);
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // The in-memory reset still succeeds.
    }
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      onSubmit={(event) => {
        if (!validateBasics()) {
          event.preventDefault();
          return;
        }
        if (!confirmed) {
          event.preventDefault();
          setStep(2);
          setConfirmationError(true);
        }
      }}
      className="card-float overflow-hidden"
    >
      <div className="border-b border-slate-100 bg-white/45 px-5 py-4 sm:px-7">
        <div>
          <nav className="flex items-center gap-1" aria-label="Request steps">
            {["Event basics", "Message", "Suggested plan"].map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  if (index > 0 && !validateBasics()) return;
                  setStep(index);
                }}
                aria-current={step === index ? "step" : undefined}
                aria-label={`${index + 1}. ${label}${index < step ? " — complete" : step === index ? " — current step" : ""}`}
                className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl px-2 py-2 text-left text-xs font-bold sm:px-3 ${
                  step === index ? "bg-ink text-white" : index < step ? "text-emerald-700 hover:bg-emerald-50" : "text-muted hover:bg-sky-bg"
                }`}
              >
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] ${step === index ? "bg-white/20" : index < step ? "bg-emerald-100" : "bg-slate-100"}`}>
                  {index < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
                </span>
                <span className="hidden truncate sm:block">{label}</span>
              </button>
            ))}
          </nav>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-1">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Save className="h-3.5 w-3.5" aria-hidden />
              Saved only in this browser · clears after 7 days
            </span>
            <button
              type="button"
              onClick={clearDraft}
              disabled={!draftHasContent}
              className="inline-flex min-h-11 items-center gap-1 rounded-full px-2.5 py-2 text-xs font-bold text-sky-700 hover:bg-sky-bg disabled:text-slate-400 disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Clear draft
            </button>
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden>
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500 transition-[width]"
            style={{ width: `${((step + 1) / 3) * 100}%` }}
          />
        </div>
      </div>

      <div className="p-5 sm:p-7">
        {(visibleServerMessage || Object.keys(clientErrors).length > 0) && (
          <div role="alert" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">
            {visibleServerMessage || "A few details still need attention."}
          </div>
        )}

        {restored && (
          <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm">
            <span className="font-semibold text-sky-900">Your saved draft is ready to continue.</span>
            <button type="button" onClick={clearDraft} className="font-bold text-sky-700 hover:underline">Start over</button>
          </div>
        )}

        <section data-step="0" hidden={step !== 0} aria-labelledby="intake-basics-heading">
          <div className="mb-5">
            <p className="text-xs font-extrabold uppercase tracking-wide text-sky-700">Step 1 of 3</p>
            <h2 id="intake-basics-heading" className="mt-1 text-2xl font-extrabold text-ink">Start with what won’t change</h2>
            <p className="mt-1 text-sm text-muted">The event, date, and person we can follow up with.</p>
          </div>

          {canImport && (
            <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-violet-100 bg-violet-50/60 p-4 sm:flex-row sm:items-center">
              <Sparkles className="h-5 w-5 shrink-0 text-violet-700" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-violet-950">Already in Planning Center?</p>
                <p className="text-xs text-violet-800/80">Importing first can bring in the title, date, location, tags, and owner.</p>
              </div>
              <Link href="/imports?source=pco" className="inline-flex min-h-11 items-center rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-bold text-violet-800">
                Find the event
              </Link>
            </div>
          )}

          {recentRequests.length > 0 && (
            <details className="mb-5 rounded-2xl border border-slate-200 bg-white/60 p-4">
              <summary className="cursor-pointer text-sm font-bold text-sky-700">
                Reuse details from a recent request
              </summary>
              <div className="mt-3 flex flex-wrap gap-2">
                {recentRequests.slice(0, 5).map((request) => (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => applyTemplate(request)}
                    className="min-h-11 rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-ink hover:bg-sky-bg"
                  >
                    {request.title}
                  </button>
                ))}
              </div>
            </details>
          )}

          <fieldset className="grid gap-4">
            <legend className="sr-only">Event basics</legend>
            {user ? (
              <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm">
                <p className="font-bold text-ink">Submitting as {user.name ?? "church staff"}</p>
                <p className="text-muted">{user.email}</p>
                <p className="mt-1 text-xs text-muted">This request will appear in My Requests automatically.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-sm font-semibold text-muted">Your name <span className="font-normal">(optional)</span></span>
                  <input
                    name="requesterName"
                    value={draft.requesterName}
                    onChange={(event) => update("requesterName", event.target.value)}
                    autoComplete="name"
                    placeholder="Jane Doe"
                    className="min-h-11 rounded-2xl border px-4 py-2"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-semibold text-muted">Email <span aria-hidden>*</span></span>
                  <input
                    name="requesterEmail"
                    value={draft.requesterEmail}
                    onChange={(event) => update("requesterEmail", event.target.value)}
                    type="email"
                    autoComplete="email"
                    aria-required="true"
                    aria-invalid={Boolean(errors.requesterEmail)}
                    aria-describedby={errors.requesterEmail ? "requester-email-error" : undefined}
                    placeholder="you@example.com"
                    className="min-h-11 rounded-2xl border px-4 py-2"
                  />
                  <FieldError id="requester-email-error" message={errors.requesterEmail} />
                </label>
              </div>
            )}

            <label className="grid gap-1.5">
              <span className="text-sm font-semibold text-muted">Ministry / team <span className="font-normal">(optional)</span></span>
              <input
                name="ministry"
                value={draft.ministry}
                onChange={(event) => update("ministry", event.target.value)}
                placeholder="e.g. Youth, Worship, Missions"
                className="min-h-11 rounded-2xl border px-4 py-2"
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-sm font-semibold text-muted">Event title <span aria-hidden>*</span></span>
              <input
                name="title"
                value={draft.title}
                onChange={(event) => update("title", event.target.value)}
                maxLength={200}
                aria-required="true"
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? "event-title-error" : undefined}
                placeholder="Summer VBS Kickoff"
                className="min-h-11 rounded-2xl border px-4 py-2"
              />
              <FieldError id="event-title-error" message={errors.title} />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-muted">Event date <span aria-hidden>*</span></span>
                <input
                  name="eventStart"
                  type="date"
                  value={draft.eventStart}
                  onChange={(event) => update("eventStart", event.target.value)}
                  aria-required="true"
                  aria-invalid={Boolean(errors.eventStart)}
                  aria-describedby={errors.eventStart ? "event-date-error" : undefined}
                  className="min-h-11 rounded-2xl border px-4 py-2"
                />
                <FieldError id="event-date-error" message={errors.eventStart} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-muted">Location <span className="font-normal">(optional)</span></span>
                <input
                  name="location"
                  value={draft.location}
                  onChange={(event) => update("location", event.target.value)}
                  placeholder="Fellowship Hall"
                  className="min-h-11 rounded-2xl border px-4 py-2"
                />
              </label>
            </div>
          </fieldset>

          {duplicate && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="flex items-center gap-2 font-bold">
                <TriangleAlert className="h-4 w-4" aria-hidden />
                This may already exist
              </p>
              <p className="mt-1 text-xs">A request named “{duplicate.title}” already uses this date.</p>
              <Link href={`/my-requests/${duplicate.id}`} className="mt-2 inline-flex font-bold text-amber-900 underline">
                Review the existing request
              </Link>
            </div>
          )}
        </section>

        <section data-step="1" hidden={step !== 1} aria-labelledby="intake-message-heading">
          <div className="mb-5">
            <p className="text-xs font-extrabold uppercase tracking-wide text-violet-700">Step 2 of 3</p>
            <h2 id="intake-message-heading" className="mt-1 text-2xl font-extrabold text-ink">What should people know and do?</h2>
            <p className="mt-1 text-sm text-muted">A clear message now makes every channel easier later.</p>
          </div>

          <fieldset className="grid gap-4">
            <legend className="sr-only">Event message and registration</legend>
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold text-muted">What’s happening? <span className="font-normal">(optional)</span></span>
              <textarea
                name="description"
                value={draft.description}
                onChange={(event) => update("description", event.target.value)}
                maxLength={5000}
                rows={4}
                placeholder="A short, public-friendly description of the event"
                className="rounded-2xl border px-4 py-3"
              />
              <span className="text-right text-xs text-muted">{draft.description.length}/5000</span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-muted">Who is it for?</span>
                <select
                  name="whoIsItFor"
                  value={draft.whoIsItFor}
                  onChange={(event) => update("whoIsItFor", event.target.value)}
                  className="min-h-11 rounded-2xl border px-4 py-2"
                >
                  <option value="whole_church">Whole church</option>
                  <option value="ministry">A specific ministry</option>
                  <option value="small_group">A small group / team</option>
                  <option value="leadership">Leadership</option>
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-muted">One public next step <span className="font-normal">(optional)</span></span>
                <input
                  name="nextStep"
                  value={draft.nextStep}
                  onChange={(event) => update("nextStep", event.target.value)}
                  maxLength={500}
                  placeholder="Register at church.org/vbs"
                  className="min-h-11 rounded-2xl border px-4 py-2"
                />
              </label>
            </div>

            <fieldset className="rounded-2xl border border-slate-200 p-4">
              <legend className="px-1 text-sm font-bold text-muted">Registration</legend>
              <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-ink">
                <input
                  name="needsRegistration"
                  type="checkbox"
                  checked={draft.needsRegistration}
                  onChange={(event) => update("needsRegistration", event.target.checked)}
                  className="h-5 w-5 rounded"
                  aria-controls="registration-details"
                  aria-expanded={draft.needsRegistration}
                />
                This event needs sign-ups
              </label>
              <div aria-live="polite">
                {draft.needsRegistration && (
                  <div id="registration-details" className="mt-3 grid gap-4 border-t border-slate-100 pt-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-1.5">
                        <span className="text-sm font-semibold text-muted">Registration link</span>
                        <input
                          name="registrationUrl"
                          type="url"
                          value={draft.registrationUrl}
                          onChange={(event) => update("registrationUrl", event.target.value)}
                          placeholder="https://church.org/vbs"
                          className="min-h-11 rounded-2xl border px-4 py-2"
                        />
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-sm font-semibold text-muted">Cost</span>
                        <input
                          name="cost"
                          value={draft.cost}
                          onChange={(event) => update("cost", event.target.value)}
                          placeholder="Free / $10"
                          className="min-h-11 rounded-2xl border px-4 py-2"
                        />
                      </label>
                    </div>
                    <label className="grid gap-1.5">
                      <span className="text-sm font-semibold text-muted">Registration closes</span>
                      <input
                        name="registrationClosesAt"
                        type="date"
                        value={draft.registrationClosesAt}
                        onChange={(event) => update("registrationClosesAt", event.target.value)}
                        className="min-h-11 rounded-2xl border px-4 py-2"
                      />
                    </label>
                    {draft.registrationUrl && !draft.nextStep && (
                      <button
                        type="button"
                        onClick={() => update("nextStep", `Register at ${draft.registrationUrl}`)}
                        className="justify-self-start text-sm font-bold text-sky-700 hover:underline"
                      >
                        Use registration as the public next step
                      </button>
                    )}
                  </div>
                )}
              </div>
            </fieldset>

            <label className="grid gap-1.5">
              <span className="text-sm font-semibold text-muted">Anything else for the comms team? <span className="font-normal">(optional)</span></span>
              <textarea
                name="notes"
                value={draft.notes}
                onChange={(event) => update("notes", event.target.value)}
                maxLength={5000}
                rows={3}
                placeholder="Internal context, sensitivities, or special requests"
                className="rounded-2xl border px-4 py-3"
              />
            </label>
          </fieldset>
        </section>

        <section data-step="2" hidden={step !== 2} aria-labelledby="intake-plan-heading">
          <div className="mb-5">
            <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-700">Step 3 of 3</p>
            <h2 id="intake-plan-heading" className="mt-1 text-2xl font-extrabold text-ink">Here’s the proposed starting plan</h2>
            <p className="mt-1 text-sm text-muted">The comms team can adjust every recommendation after review.</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section className="rounded-3xl border border-slate-200 bg-white/70 p-5" aria-labelledby="request-review-heading">
              <h3 id="request-review-heading" className="font-extrabold text-ink">Request summary</h3>
              <dl className="mt-4 grid gap-3 text-sm">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted">Event</dt>
                  <dd className="mt-0.5 font-bold text-ink">{draft.title || "Untitled event"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted">Date</dt>
                  <dd className="mt-0.5 font-semibold text-ink">{friendlyDate(draft.eventStart)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted">Audience</dt>
                  <dd className="mt-0.5 font-semibold text-ink">{plan.audienceLabel}</dd>
                </div>
                {draft.nextStep && (
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-muted">Next step</dt>
                    <dd className="mt-0.5 font-semibold text-ink">{draft.nextStep}</dd>
                  </div>
                )}
              </dl>
              <button type="button" onClick={() => setStep(0)} className="mt-4 text-sm font-bold text-sky-700 hover:underline">
                Edit the basics
              </button>
            </section>

            <section className="rounded-3xl border border-violet-100 bg-violet-50/60 p-5" aria-labelledby="suggested-plan-heading">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-700" aria-hidden />
                <h3 id="suggested-plan-heading" className="font-extrabold text-violet-950">Suggested {plan.audienceLabel.toLowerCase()} plan</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-violet-950/75">{plan.reason}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {plan.channels.length > 0 ? (
                  plan.channels.map((channel) => (
                    <span key={channel.key} className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-900">
                      {channel.name.replace(/\s*\(Top 3\)$/i, "")}
                    </span>
                  ))
                ) : (
                  <span className="text-sm font-semibold text-violet-900">The team will choose a focused channel plan.</span>
                )}
              </div>
              <div className="mt-4 rounded-2xl bg-white/75 px-4 py-3 text-sm text-violet-950">
                <p className="flex items-center gap-2 font-bold">
                  <Clock3 className="h-4 w-4" aria-hidden />
                  Timing
                </p>
                <p className="mt-1 text-xs leading-relaxed text-violet-950/75">{plan.timing}</p>
              </div>
              {plan.leadWarning && (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  <p className="flex items-center gap-2 font-bold">
                    <TriangleAlert className="h-4 w-4" aria-hidden />
                    Lead-time heads-up
                  </p>
                  <p className="mt-1 text-xs leading-relaxed">{plan.leadWarning}</p>
                </div>
              )}
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-bold text-violet-800 hover:underline">Why these channels?</summary>
                <p className="mt-2 text-xs leading-relaxed text-violet-950/70">
                  Active channel settings determine which audience tiers qualify. After submission, the team can add, remove, or re-time any channel.
                </p>
              </details>
            </section>
          </div>

          <label className={`mt-5 flex items-start gap-3 rounded-2xl border bg-white/60 p-4 text-sm ${confirmationError ? "border-rose-300" : "border-slate-200"}`}>
            <input
              type="checkbox"
              name="confirmed"
              required
              checked={confirmed}
              onChange={(event) => {
                setConfirmed(event.target.checked);
                if (event.target.checked) setConfirmationError(false);
              }}
              aria-invalid={confirmationError}
              aria-required="true"
              aria-describedby={confirmationError ? "confirmation-error" : undefined}
              className="mt-0.5 h-5 w-5 rounded"
            />
            <span>
              <span className="font-bold text-ink">I’ve checked the event date and contact information.</span>
              <span className="mt-0.5 block text-xs text-muted">The proposed plan is a starting point, not an automatic publication.</span>
              {confirmationError && (
                <span id="confirmation-error" className="mt-1 block text-xs font-bold text-rose-700">
                  Confirm these details before sending the request.
                </span>
              )}
            </span>
          </label>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white/45 px-5 py-4 sm:px-7">
        <button
          type="button"
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0 || pending}
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-muted hover:bg-sky-bg disabled:opacity-35"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </button>
        <p className="hidden text-xs text-muted sm:block">
          Fields marked <span aria-hidden>*</span> are required.
        </p>
        {step < 2 ? (
          <button
            type="button"
            onClick={nextStep}
            className="btn-primary inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-extrabold"
          >
            {step === 0 ? "Shape the message" : "Preview the plan"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending || !confirmed}
            aria-describedby={!confirmed ? "send-confirmation-help" : undefined}
            className="btn-primary inline-flex min-h-11 items-center gap-2 rounded-full px-6 py-2.5 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Sending request…" : "Send it to the comms team"}
            {!pending && <ArrowRight className="h-4 w-4" aria-hidden />}
          </button>
        )}
      </div>
      {step === 2 && !confirmed && (
        <p id="send-confirmation-help" className="border-t border-slate-100 bg-white/45 px-5 pb-4 text-right text-xs font-semibold text-muted sm:px-7">
          Check the confirmation above to send this request.
        </p>
      )}
    </form>
  );
}
