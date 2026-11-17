"use client";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  FileText,
  Loader2,
  Save,
  ShieldCheck,
} from "lucide-react";
import type { Job } from "@/lib/types";
type Draft = {
  title: string;
  script: string;
  claims: { text: string; sourceUrls: string[] }[];
  uncertainties?: string[];
};
export default function ScriptEditor({
  job,
  refresh,
  notify,
}: {
  job: Job;
  refresh: () => Promise<void>;
  notify: (s: string, e?: boolean) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [claims, setClaims] = useState("[]");
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    async function load() {
      try {
        let d: Draft;
        if (job.artifacts.draft) {
          const r = await fetch(job.artifacts.draft);
          if (!r.ok) throw new Error("The saved draft could not be loaded.");
          d = await r.json();
        } else if (job.script) {
          d = { title: job.title, script: job.script, claims: [] };
          if (job.artifacts.claims) {
            const r = await fetch(job.artifacts.claims);
            if (r.ok) {
              const c = await r.json();
              d.claims = Array.isArray(c) ? c : c.claims || [];
            }
          }
        } else {
          if (!cancelled) setDraft(null);
          return;
        }
        if (job.script) d.script = job.script;
        if (!cancelled) {
          setDraft(d);
          setClaims(JSON.stringify(d.claims, null, 2));
          setApproved(false);
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [job.id, job.artifacts.draft, job.script]);
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const mapped = JSON.parse(claims);
      const r = await fetch("/api/jobs/" + job.id + "/script", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          script: draft.script,
          claims: mapped,
          editorialApproved: approved,
        }),
      });
      const d = await r.json();
      if (!r.ok)
        throw new Error(
          d.message || d.error || "The revision could not be saved.",
        );
      notify(
        approved
          ? "Script approval saved. Narration is queued."
          : "Script revision saved for review.",
      );
      setApproved(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="script-loading">
        <Loader2 size={17} className="spin" />
        Loading your saved draft…
      </div>
    );
  if (!draft)
    return (
      <p className="detail-empty">
        {error ||
          "The source-backed draft will appear here when writing has produced a reviewable version."}
      </p>
    );
  const count = draft.script.trim().split(/\s+/).filter(Boolean).length;
  const min = Math.round((job.duration / 60) * 120),
    max = Math.round((job.duration / 60) * 150);
  const editable = [
    "NEEDS_REVIEW",
    "BLOCKED_AUTH",
    "NEEDS_RESEARCH",
    "FAILED",
    "PAUSED",
    "SCRIPTED",
  ].includes(job.status);
  return (
    <div className="script-editor">
      {draft.uncertainties?.length ? (
        <div className="blocker-box">
          <AlertCircle size={18} />
          <div>
            <strong>Resolve these source gaps</strong>
            <ul>
              {draft.uncertainties.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
            <p>
              Remove unsupported details or supply evidence before approving the
              narrative.
            </p>
          </div>
        </div>
      ) : null}
      <label className="field-label">
        Story title
        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          maxLength={150}
          disabled={!editable}
        />
      </label>
      <div className="script-label">
        <label htmlFor="script-draft">Spoken script</label>
        <span className={count < min || count > max ? "word-warning" : ""}>
          {count} words · target {min}–{max}
        </span>
      </div>
      <textarea
        id="script-draft"
        className="script-input"
        value={draft.script}
        onChange={(e) => setDraft({ ...draft, script: e.target.value })}
        maxLength={20000}
        disabled={!editable}
      />
      <details className="claim-editor">
        <summary>
          <FileText size={14} />
          Claim-to-source map
        </summary>
        <p>
          Every factual claim must link to the exact evidence URLs already
          retrieved for this story. Check the Sources tab alongside your
          revision.
        </p>
        <textarea
          aria-label="Claim source map JSON"
          value={claims}
          onChange={(e) => setClaims(e.target.value)}
          spellCheck={false}
          disabled={!editable}
        />
      </details>
      <div className="inline-note">
        <ShieldCheck size={16} />
        <span>
          Revisions are archived. Approving a script starts narration; it does
          not authorize publication.
        </span>
      </div>
      <label className="check-field">
        <input
          type="checkbox"
          checked={approved}
          onChange={(e) => setApproved(e.target.checked)}
          disabled={!editable}
        />
        <span>
          I have reviewed every factual claim against the supplied sources,
          resolved the uncertainties, and approve this script for narration.
        </span>
      </label>
      {error && (
        <p className="script-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary-button"
        onClick={save}
        disabled={!editable || busy || !draft.script.trim()}
      >
        {busy ? (
          <Loader2 size={15} className="spin" />
        ) : approved ? (
          <Check size={15} />
        ) : (
          <Save size={15} />
        )}{" "}
        {approved ? "Approve & continue" : "Save revision for review"}
      </button>
    </div>
  );
}
