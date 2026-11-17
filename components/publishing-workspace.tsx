"use client";
import { useState, useEffect, useCallback } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  Film,
  Link2,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
  AlertCircle,
} from "lucide-react";
import type { DashboardData, Platform } from "@/lib/types";
import type { StoryVariant } from "@/lib/variant-types";
import type { Publication, TikTokCreatorInfo } from "@/lib/publishers";
const labels = {
  youtube: "YouTube Shorts",
  facebook: "Facebook Reels",
  tiktok: "TikTok",
};
const label = (s: string) =>
  s
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await r.json();
  if (!r.ok)
    throw new Error(
      body.message || body.error || "The request could not be completed.",
    );
  return body as T;
}
export default function PublishingWorkspace({
  data,
  openConnections,
  notify,
}: {
  data: DashboardData;
  openConnections: () => void;
  notify: (s: string, e?: boolean) => void;
}) {
  const [variants, setVariants] = useState<StoryVariant[]>([]);
  const [jobId, setJobId] = useState(data.jobs[0]?.id || "");
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState<StoryVariant | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const result = await request<{ variants: StoryVariant[] }>(
        "/api/variants",
      );
      setVariants(result.variants);
      setSelected((v) =>
        v ? result.variants.find((x) => x.id === v.id) || v : null,
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);
  async function create(platform: Platform) {
    if (!jobId) return;
    setBusy(platform);
    try {
      const r = await request<{ variant: StoryVariant; created: boolean }>(
        "/api/variants",
        { method: "POST", body: JSON.stringify({ jobId, platform }) },
      );
      await refresh();
      setSelected(r.variant);
      notify(
        r.created
          ? "Your platform adaptation request is saved."
          : "Opening your existing adaptation.",
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">READY FOR THE WORLD</div>
          <h1>Give your stories their moment.</h1>
          <p>
            A complete short narrative for every platform. Review the story,
            then choose when to share it.
          </p>
        </div>
        <button className="secondary-button" onClick={openConnections}>
          <Link2 size={16} />
          Manage channels
        </button>
      </div>
      <section className="card adaptation-source">
        <span className="large-icon">
          <Film size={22} />
        </span>
        <div>
          <h2>Start with your researched story</h2>
          <p>
            Each adaptation gets its own beginning, turning point, and payoff.
          </p>
        </div>
        <label className="field-label">
          <span className="visually-hidden">Source story</span>
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            aria-label="Source story"
          >
            <option value="">Choose a story</option>
            {data.jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title || j.prompt}
              </option>
            ))}
          </select>
        </label>
      </section>
      <div className="publishing-platforms">
        {(["youtube", "facebook", "tiktok"] as Platform[]).map((p, i) => {
          const account = data.connections.find((c) => c.id === p);
          const existing = variants.find(
            (v) => v.platform === p && v.sourceJobId === jobId,
          );
          return (
            <section className="card publish-platform adaptation-card" key={p}>
              <div className="adaptation-card-head">
                <span className={"service-icon service-" + p}>
                  {p === "youtube" ? (
                    <PlayLogo />
                  ) : p === "facebook" ? (
                    <span className="facebook-letter">f</span>
                  ) : (
                    <span className="tiktok-letter">♪</span>
                  )}
                </span>
                <span
                  className={
                    "status-pill " + (account?.connected ? "success" : "")
                  }
                >
                  <span />
                  {account?.connected ? "Connected" : "Not connected"}
                </span>
              </div>
              <h3>{labels[p]}</h3>
              <p>
                {
                  [
                    "A complete vertical story, up to 3 minutes.",
                    "A focused 45–60 second story for your Page.",
                    "A reviewed short with your privacy and consent.",
                  ][i]
                }
              </p>
              <div className="adaptation-footer">
                {existing ? (
                  <>
                    <span
                      className={
                        "status-pill " +
                        (existing.status.includes("BLOCKED") ? "warning" : "")
                      }
                    >
                      <span />
                      {label(existing.status)}
                    </span>
                    <button
                      className="secondary-button"
                      onClick={() => setSelected(existing)}
                    >
                      Open adaptation <ArrowUpRight size={14} />
                    </button>
                  </>
                ) : (
                  <button
                    className="secondary-button"
                    disabled={!jobId || busy === p}
                    onClick={() => create(p)}
                  >
                    {busy === p ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    Create adaptation <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <div className="section-heading">
        <div>
          <h2>
            Your adaptations{" "}
            <span className="count-pill">{variants.length}</span>
          </h2>
          <p>Every platform has its own production and publication status.</p>
        </div>
        <button
          className="icon-button"
          aria-label="Refresh adaptations"
          onClick={refresh}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      {error && (
        <div className="inline-note">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      <div className="card">
        {variants.length ? (
          variants.map((v) => (
            <button
              className="job-row variant-row"
              key={v.id}
              onClick={() => setSelected(v)}
            >
              <span className="job-thumb">
                <Film size={22} />
              </span>
              <span className="job-text">
                <strong>{v.title}</strong>
                <span>
                  {labels[v.platform]} ·{" "}
                  {v.duration
                    ? Math.round(v.duration) + "s"
                    : "Target " + v.targetDuration + "s"}
                </span>
              </span>
              <span
                className={
                  "status-pill " +
                  (v.status.includes("BLOCKED") || v.status === "NEEDS_RESEARCH"
                    ? "warning"
                    : "")
                }
              >
                <span />
                {label(v.status)}
              </span>
              <ArrowUpRight size={15} />
            </button>
          ))
        ) : (
          <div className="empty-state">
            <span className="empty-state-icon">
              <Send size={29} strokeWidth={1.4} />
            </span>
            <h3>A thoughtful story. A thoughtful send-off.</h3>
            <p>
              Select a researched story and create an adaptation above. Your
              finished previews, editorial approvals, and publication results
              will live here.
            </p>
          </div>
        )}
      </div>
      <div className="inline-note publishing-note">
        <ShieldCheck size={18} />
        <span>
          Publishing requires reviewed media and an authorized account. TikTok
          creator settings are refreshed at review time; privacy is always your
          choice.
        </span>
      </div>
      {selected && (
        <VariantReview
          variant={selected}
          data={data}
          close={() => setSelected(null)}
          refresh={refresh}
          notify={notify}
        />
      )}
    </>
  );
}
function PlayLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <rect x="2" y="5" width="20" height="14" rx="4" />
      <path d="m10 9 5 3-5 3" fill="var(--surface)" />
    </svg>
  );
}
function VariantReview({
  variant: v,
  data,
  close,
  refresh,
  notify,
}: {
  variant: StoryVariant;
  data: DashboardData;
  close: () => void;
  refresh: () => Promise<void>;
  notify: (s: string, e?: boolean) => void;
}) {
  const [editorial, setEditorial] = useState(false);
  const [rights, setRights] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [title, setTitle] = useState(v.title);
  const [description, setDescription] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [privacy, setPrivacy] = useState("");
  const [consent, setConsent] = useState(false);
  const [ai, setAi] = useState(true);
  const [commercial, setCommercial] = useState(false);
  const [busy, setBusy] = useState("");
  const [creator, setCreator] = useState<TikTokCreatorInfo | null>(null);
  const [creatorError, setCreatorError] = useState("");
  const [publication, setPublication] = useState<Publication | null>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [close]);
  useEffect(() => {
    if (v.platform === "tiktok")
      request<{ creator: TikTokCreatorInfo }>("/api/tiktok/creator-info")
        .then((r) => setCreator(r.creator))
        .catch((e) => setCreatorError(e.message));
  }, [v.id, v.platform]);
  useEffect(() => {
    if (
      !publication ||
      !["UPLOADING", "PROCESSING"].includes(publication.status)
    )
      return;
    const t = setInterval(
      () =>
        request<{ publication: Publication }>(
          "/api/publications/" + publication.id,
        )
          .then((r) => setPublication(r.publication))
          .catch(() => {}),
      7000,
    );
    return () => clearInterval(t);
  }, [publication]);
  async function retry() {
    setBusy("retry");
    try {
      await request("/api/variants/" + v.id + "/retry", {
        method: "POST",
        body: JSON.stringify({ platform: v.platform }),
      });
      notify("Adaptation queued for retry.");
      await refresh();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }
  async function approve() {
    setBusy("approve");
    try {
      await request("/api/variants/" + v.id + "/review", {
        method: "POST",
        body: JSON.stringify({
          platform: v.platform,
          editorialApproved: editorial,
          rightsApproved: rights,
          confirmed,
        }),
      });
      notify(
        "Editorial and media review saved. Publication consent is separate.",
      );
      await refresh();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }
  async function publish() {
    setBusy("publish");
    try {
      const result = await request<{ publication: Publication }>(
        "/api/publish/" + v.platform + "/" + v.id,
        {
          method: "POST",
          body: JSON.stringify({
            title,
            description,
            hashtags: hashtags.split(/\s+/).filter(Boolean),
            approved: true,
            rightsApproved: true,
            consent,
            privacy,
            isAiGenerated: ai,
            commercialContent: commercial,
          }),
        },
      );
      setPublication(result.publication);
      notify(
        result.publication.status === "PUBLISHED"
          ? "Publication verified."
          : label(result.publication.status) + ".",
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }
  const reviewable = Boolean(v.artifacts.video && v.qaPassed);
  const approved = v.editorialApproved && v.rightsApproved;
  const account = data.connections.find((c) => c.id === v.platform);
  const choices =
    v.platform === "tiktok"
      ? creator?.privacy_level_options || []
      : v.platform === "facebook"
        ? ["public"]
        : ["private", "unlisted", "public"];
  return (
    <div className="detail-shade" onClick={close}>
      <aside
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Adaptation review"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-top">
          <span>
            <Send size={17} />
            {labels[v.platform]} adaptation
          </span>
          <button
            className="icon-button"
            aria-label="Close adaptation"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        <div className="detail-body">
          <span
            className={
              "status-pill " + (v.status.includes("BLOCKED") ? "warning" : "")
            }
          >
            <span />
            {label(v.status)}
          </span>
          <h2>{v.title}</h2>
          <p className="detail-meta">
            Independent narrative · target {v.targetDuration}s · maximum{" "}
            {v.durationLimit}s
          </p>
          {v.blocker && (
            <div className="blocker-box">
              <AlertCircle size={19} />
              <div>
                <strong>Next step</strong>
                <p>{v.blocker}</p>
              </div>
            </div>
          )}
          {v.artifacts.video ? (
            <video
              className="variant-preview"
              src={v.artifacts.video}
              controls
              preload="metadata"
            />
          ) : (
            <div className="variant-placeholder">
              <Film size={33} strokeWidth={1.3} />
              <span>Your finished preview will appear here.</span>
            </div>
          )}
          <div className="variant-file-links">
            {v.artifacts.video && (
              <a className="secondary-button" href={v.artifacts.video} download>
                <Download size={14} />
                Download MP4
              </a>
            )}
            {v.artifacts.captions && (
              <a
                className="secondary-button"
                href={v.artifacts.captions}
                download
              >
                <FileText size={14} />
                Captions
              </a>
            )}
            {v.artifacts.qa && (
              <a
                className="text-button"
                href={v.artifacts.qa}
                target="_blank"
                rel="noopener noreferrer"
              >
                Media QA <ExternalLink size={12} />
              </a>
            )}
          </div>
          {v.script && (
            <details className="variant-script">
              <summary>
                Read the adapted script <ChevronDown size={15} />
              </summary>
              <p>{v.script}</p>
            </details>
          )}
          {v.sources.length > 0 && (
            <details className="variant-script">
              <summary>
                Review source evidence <ChevronDown size={15} />
              </summary>
              <div className="variant-source-links">
                {v.sources.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {s.title}
                    <ExternalLink size={12} />
                  </a>
                ))}
              </div>
              {v.claims?.map((c, i) => (
                <p key={i}>
                  {c.text}
                  <small>{c.sourceUrls.join(" · ")}</small>
                </p>
              ))}
            </details>
          )}
          {!approved && (
            <section className="review-section">
              <h3>Editorial & media review</h3>
              <p>
                Review the complete video, narration, captions, evidence, and
                usage rights.
              </p>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={editorial}
                  onChange={(e) => setEditorial(e.target.checked)}
                  disabled={!reviewable}
                />
                <span>
                  I have checked the facts, script, speech, and captions.
                </span>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={rights}
                  onChange={(e) => setRights(e.target.checked)}
                  disabled={!reviewable}
                />
                <span>
                  I have verified the media and audio rights for this
                  destination.
                </span>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  disabled={!reviewable}
                />
                <span>I have watched the complete rendered adaptation.</span>
              </label>
              <button
                className="primary-button"
                onClick={approve}
                disabled={
                  !reviewable ||
                  !editorial ||
                  !rights ||
                  !confirmed ||
                  Boolean(busy)
                }
              >
                {busy === "approve" ? (
                  <Loader2 className="spin" size={15} />
                ) : (
                  <Check size={15} />
                )}
                Approve this adaptation
              </button>
            </section>
          )}
          {approved && (
            <section className="review-section metadata-section">
              <span className="status-pill success">
                <CheckCircle2 size={12} />
                Editorial review complete
              </span>
              <h3>Prepare your post</h3>
              {v.platform === "tiktok" &&
                (creator ? (
                  <div className="creator-card">
                    <strong>
                      @{creator.creator_username || creator.creator_nickname}
                    </strong>
                    <span>
                      {creator.creator_nickname} · Maximum{" "}
                      {creator.max_video_post_duration_sec}s
                    </span>
                    <small>
                      Comments{" "}
                      {creator.comment_disabled ? "unavailable" : "available"} ·
                      Duet {creator.duet_disabled ? "unavailable" : "available"}{" "}
                      · Stitch{" "}
                      {creator.stitch_disabled ? "unavailable" : "available"}
                    </small>
                  </div>
                ) : (
                  <div className="inline-note">
                    <AlertCircle size={16} />
                    <span>
                      {creatorError || "Loading current creator settings…"}
                    </span>
                  </div>
                ))}
              <label className="field-label">
                Post title
                <input
                  maxLength={100}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="field-label">
                Caption
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={5000}
                  rows={4}
                />
              </label>
              <label className="field-label">
                Hashtags
                <input
                  value={hashtags}
                  onChange={(e) => setHashtags(e.target.value)}
                  placeholder="#inspiration #truestory"
                />
              </label>
              <label className="field-label">
                {v.platform === "tiktok"
                  ? "Privacy (choose manually)"
                  : "Visibility"}
                <select
                  value={privacy}
                  onChange={(e) => setPrivacy(e.target.value)}
                >
                  <option value="">Select visibility…</option>
                  {choices.map((x) => (
                    <option key={x} value={x}>
                      {label(x)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={ai}
                  onChange={(e) => setAi(e.target.checked)}
                />
                <span>
                  Disclose AI-generated or significantly altered content.
                </span>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={commercial}
                  onChange={(e) => setCommercial(e.target.checked)}
                />
                <span>This post promotes a brand, product, or service.</span>
              </label>
              <label className="check-field consent-field">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  {v.platform === "tiktok"
                    ? "I approve this preview, caption, disclosures, and selected privacy for the official TikTok handoff."
                    : "I authorize posting this reviewed video and metadata to the connected " +
                      labels[v.platform] +
                      " account with the selected visibility."}
                </span>
              </label>
              {!account?.connected && (
                <div className="inline-note">
                  <Link2 size={16} />
                  <span>
                    Connect your account before publishing. Your reviewed video
                    remains available to download.
                  </span>
                </div>
              )}
              <button
                className="primary-button"
                onClick={publish}
                disabled={
                  !title.trim() ||
                  !privacy ||
                  !consent ||
                  !account?.connected ||
                  Boolean(busy) ||
                  (v.platform === "tiktok" && !creator)
                }
              >
                {busy === "publish" ? (
                  <Loader2 className="spin" size={15} />
                ) : (
                  <Send size={15} />
                )}{" "}
                {v.platform === "tiktok"
                  ? "Prepare official handoff"
                  : "Publish to " + labels[v.platform]}
              </button>
              {v.platform === "tiktok" && (
                <p className="publishing-disclosure">
                  Direct Post eligibility is not verified. This creates a manual
                  handoff; it does not publish to TikTok.
                </p>
              )}
            </section>
          )}
          {publication && (
            <div className="publication-result">
              <strong>{label(publication.status)}</strong>
              {publication.message && <p>{publication.message}</p>}
              {publication.externalId && (
                <span>External ID: {publication.externalId}</span>
              )}
              {publication.url && (
                <a
                  href={publication.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open platform result <ExternalLink size={14} />
                </a>
              )}
              <small>
                {new Date(publication.updatedAt).toLocaleString("en-PH", {
                  timeZone: "Asia/Manila",
                })}{" "}
                · Asia/Manila
              </small>
            </div>
          )}
          {[
            "BLOCKED_AUTH",
            "NEEDS_RESEARCH",
            "FAILED",
            "NEEDS_REVIEW",
          ].includes(v.status) &&
            !reviewable && (
              <button
                className="secondary-button"
                onClick={retry}
                disabled={Boolean(busy)}
              >
                {busy === "retry" ? (
                  <Loader2 className="spin" size={14} />
                ) : (
                  <RefreshCw size={14} />
                )}
                Retry adaptation
              </button>
            )}
          <div className="job-id">
            <span>Adaptation ID</span>
            <code>{v.id}</code>
          </div>
        </div>
      </aside>
    </div>
  );
}
