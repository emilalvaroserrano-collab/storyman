"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  ArrowRight,
  AudioLines,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  CircleHelp,
  Clock,
  Clapperboard,
  Command,
  Download,
  ExternalLink,
  FileAudio,
  Film,
  FolderOpen,
  Globe,
  Grid2X2,
  Layers,
  Library,
  Link2,
  Loader2,
  Menu,
  Monitor,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Upload,
  Video,
  WandSparkles,
  X,
  Zap,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  SquarePen,
  Moon,
} from "lucide-react";
import PublishingWorkspace from "./publishing-workspace";
import ScriptEditor from "./script-editor";
import type {
  DashboardData,
  Job,
  Platform,
  Schedule,
  Settings,
  Connection,
} from "@/lib/types";

type View =
  | "overview"
  | "queue"
  | "library"
  | "schedule"
  | "publishing"
  | "analytics"
  | "connections"
  | "settings";
const genres = [
  "Rags to Riches",
  "Business Empire",
  "Celebrity Comeback",
  "Inspirational Real Story",
  "Custom",
];
const viewNames: Record<View, string> = {
  overview: "Overview",
  queue: "Video queue",
  library: "Story library",
  schedule: "Schedule",
  publishing: "Publishing",
  analytics: "Analytics",
  connections: "Connections",
  settings: "Settings",
};
const nav = [
  { id: "overview", icon: Grid2X2, label: "Overview" },
  { id: "queue", icon: Layers, label: "Video queue" },
  { id: "library", icon: Library, label: "Story library" },
  { id: "schedule", icon: CalendarDays, label: "Schedule" },
  { id: "publishing", icon: Send, label: "Publishing" },
  { id: "analytics", icon: BarChart3, label: "Analytics" },
] as const;
const prompts: Record<string, string> = {
  "Rags to Riches":
    "Tell the true story of a Filipino entrepreneur who started with very little. Find the turning point that changed everything.",
  "Business Empire":
    "Research how a small business became an empire. Focus on the hard decisions, the setbacks, and the lesson we can use.",
  "Celebrity Comeback":
    "Find a documented celebrity comeback. Tell the story behind their lowest moment and how they rebuilt their career.",
  "Inspirational Real Story":
    "Find an inspiring true story of an unlikely achievement. Make it human, source-backed, and meaningful.",
  Custom: "",
};
const stages = [
  "Research",
  "Script",
  "Narration",
  "Media",
  "Editing",
  "Quality check",
  "Ready",
];
function Mark({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? "brand-mark small" : "brand-mark"}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20.6 7.8c9.2 0 15.1 13.8 7.2 19.1S10.8 29.7 11.4 20.5 24.6 7.4 28.6 16.6s-7.9 18.4-14.5 12.5-7.2-13.2 2.6-15.8 15.8 9.2 7.9 15.8"
        stroke="currentColor"
        strokeWidth="2.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
function PlatformIcon({
  platform,
  size = 17,
}: {
  platform: string;
  size?: number;
}) {
  if (platform === "youtube")
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M21.6 7.1a3 3 0 0 0-2.1-2.2C17.7 4.4 12 4.4 12 4.4s-5.7 0-7.5.5a3 3 0 0 0-2.1 2.2C2 8.9 2 12 2 12s0 3.1.4 4.9a3 3 0 0 0 2.1 2.2c1.8.5 7.5.5 7.5.5s5.7 0 7.5-.5a3 3 0 0 0 2.1-2.2c.4-1.8.4-4.9.4-4.9s0-3.1-.4-4.9ZM10 15.3V8.7l5.7 3.3-5.7 3.3Z" />
      </svg>
    );
  if (platform === "facebook")
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M22 12.06A10 10 0 1 0 10.44 22v-7.03H7.9v-2.91h2.54V9.84c0-2.52 1.5-3.91 3.78-3.91 1.1 0 2.25.2 2.25.2V8.6H15.2c-1.24 0-1.64.77-1.64 1.56v1.88h2.8l-.45 2.91h-2.35V22A10 10 0 0 0 22 12.06Z" />
      </svg>
    );
  if (platform === "tiktok")
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M16.7 2h-3.3v13.3a2.9 2.9 0 1 1-2.5-2.9V9.1a6.1 6.1 0 1 0 5.8 6.2V8.6a8 8 0 0 0 4.6 1.5V6.8A4.6 4.6 0 0 1 16.7 2Z" />
      </svg>
    );
  return <span className="canva-letter">C</span>;
}
const platformLabel: Record<string, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  tiktok: "TikTok",
  canva: "Canva",
};
function statusLabel(status: string) {
  return status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
}
function isBlocked(j: Job) {
  return [
    "BLOCKED_AUTH",
    "BLOCKED_RIGHTS",
    "CANVA_CAPABILITY_MISSING",
    "NEEDS_RESEARCH",
    "NEEDS_REVIEW",
    "REVIEW_REQUIRED",
    "FAILED",
  ].includes(j.status);
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}
function upcoming(schedule: Schedule) {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: schedule.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    const current = Number(p.hour) * 60 + Number(p.minute);
    return schedule.slots
      .filter((s) => s.enabled)
      .map((s) => {
        const [h, m] = s.time.split(":").map(Number);
        return { ...s, tomorrow: h * 60 + m <= current };
      })
      .sort(
        (a, b) =>
          Number(a.tomorrow) - Number(b.tomorrow) ||
          a.time.localeCompare(b.time),
      );
  } catch {
    return [];
  }
}
async function api<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  const body = await r
    .json()
    .catch(() => ({ error: "The server returned an unexpected response." }));
  if (!r.ok)
    throw new Error(
      body.message || body.error || "The request could not be completed.",
    );
  return body as T;
}

export default function Studio() {
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [selected, setSelected] = useState<Job | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dark, setDark] = useState(false);
  const [help, setHelp] = useState(false);
  const notify = useCallback((text: string, error = false) => {
    setNotice({ text, error });
  }, []);
  const refresh = useCallback(async () => {
    try {
      const d = await api<DashboardData>("/api/dashboard");
      setData(d);
      setLoadError("");
      setSelected((j) => (j ? d.jobs.find((x) => x.id === j.id) || j : null));
    } catch (e) {
      const msg = (e as Error).message;
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    const saved = localStorage.getItem("storyman-theme") === "dark";
    setDark(saved);
    document.documentElement.dataset.theme = saved ? "dark" : "light";
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Tab") {
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
        if (dialog) {
          const items = Array.from(
            dialog.querySelectorAll<HTMLElement>(
              'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
            ),
          ).filter((el) => el.offsetParent !== null);
          const first = items[0],
            last = items[items.length - 1];
          if (first && last) {
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                !dialog.contains(document.activeElement))
            ) {
              e.preventDefault();
              last.focus();
            } else if (
              !e.shiftKey &&
              (document.activeElement === last ||
                !dialog.contains(document.activeElement))
            ) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((x) => !x);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        setView("overview");
        setMobileOpen(false);
        setTimeout(() => document.getElementById("story-prompt")?.focus(), 50);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setSelected(null);
        setMobileOpen(false);
        setHelp(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  function navigate(v: View) {
    setView(v);
    setMobileOpen(false);
    window.scrollTo(0, 0);
  }
  const active =
    data?.jobs.filter(
      (j) => !["CANCELLED", "PUBLISHED", "FAILED", "PAUSED"].includes(j.status),
    ).length || 0;
  async function jobAction(job: Job, action: string) {
    try {
      await api(`/api/jobs/${job.id}/${action}`, { method: "POST" });
      notify(
        `Story ${action === "retry" ? "queued for retry" : action === "cancel" ? "cancelled" : action === "pause" ? "paused" : "resumed"}.`,
      );
      refresh();
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
      {mobileOpen && (
        <div className="mobile-shade" onClick={() => setMobileOpen(false)} />
      )}
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <button
          className="workspace-brand"
          onClick={() => navigate("overview")}
          aria-label="Storyman home"
        >
          <span className="brand-box">
            <Mark />
          </span>
          <span className="brand-word">
            storyman<span className="beta">BETA</span>
          </span>
          <ChevronsUpDown size={14} className="brand-chevron" />
        </button>
        <button
          className="new-story"
          aria-label="New story"
          onClick={() => {
            navigate("overview");
            setTimeout(
              () => document.getElementById("story-prompt")?.focus(),
              50,
            );
          }}
        >
          <SquarePen size={17} />
          <span>New story</span>
          <span className="shortcut">⌘ N</span>
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${view === n.id ? "active" : ""}`}
              onClick={() => navigate(n.id)}
              title={n.label}
            >
              <n.icon size={18} strokeWidth={1.65} />
              <span>{n.label}</span>
              {n.id === "queue" && active > 0 && (
                <span className="nav-count">{active}</span>
              )}
              {n.id === "schedule" && data?.schedule.enabled && (
                <span className="tiny-dot" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="nav-label">YOUR STUDIO</div>
        <button
          title="Connections"
          className={`nav-item ${view === "connections" ? "active" : ""}`}
          onClick={() => navigate("connections")}
        >
          <Link2 size={18} strokeWidth={1.65} />
          <span>Connections</span>
          <span className="connection-count">
            {data?.connections.filter((c) => c.connected).length || 0}/4
          </span>
        </button>
        <button
          title="Settings"
          className={`nav-item ${view === "settings" ? "active" : ""}`}
          onClick={() => navigate("settings")}
        >
          <Settings2 size={18} strokeWidth={1.65} />
          <span>Settings</span>
        </button>
        <div className="sidebar-bottom">
          <div className="studio-note">
            <span className="note-icon">
              <Sparkles size={16} />
            </span>
            <strong>A little idea. A big impact.</strong>
            <p>Your next story could be the one someone needs to hear.</p>
            <button
              onClick={() => {
                navigate("overview");
                document.getElementById("story-prompt")?.focus();
              }}
            >
              Let’s make it happen <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className="nav-item help-button"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={17} />
            <span>Help & getting started</span>
            <ArrowUpRight size={14} />
          </button>
          <button className="profile" onClick={() => navigate("settings")}>
            <span className="avatar">ME</span>
            <span>
              <strong>Master E</strong>
              <small>Personal workspace</small>
            </span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button sidebar-toggle"
              aria-label="Toggle sidebar"
              onClick={() =>
                window.innerWidth < 900
                  ? setMobileOpen(!mobileOpen)
                  : setCollapsed(!collapsed)
              }
            >
              <Menu size={18} />
            </button>
            <span className="breadcrumb-root">Workspace</span>
            <ChevronRight size={13} className="breadcrumb-chevron" />
            <span className="breadcrumb-current">{viewNames[view]}</span>
          </div>
          <div className="topbar-right">
            <span className="local-status">
              <span className="tiny-dot" />
              Local workspace
            </span>
            <span className="toolbar-separator" />
            <button
              className="icon-button"
              aria-label="Search workspace"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={17} />
            </button>
            <button
              className="icon-button theme-toggle"
              aria-label="Toggle color theme"
              onClick={() => {
                setDark(!dark);
                document.documentElement.dataset.theme = dark
                  ? "light"
                  : "dark";
                localStorage.setItem("storyman-theme", dark ? "light" : "dark");
              }}
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button
              className="top-avatar"
              aria-label="Open settings"
              onClick={() => navigate("settings")}
            >
              ME
            </button>
          </div>
        </header>
        <main className={`main-content view-${view}`}>
          {loading ? (
            <div className="loading-state">
              <Mark />
              <span>Opening your studio…</span>
              <Loader2 size={18} className="spin" />
            </div>
          ) : loadError && !data ? (
            <div className="full-empty">
              <AlertCircle size={30} />
              <h2>Your studio needs attention</h2>
              <p>{loadError}</p>
              <button className="primary-button" onClick={refresh}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          ) : (
            data && (
              <>
                {view === "overview" && (
                  <Overview
                    data={data}
                    onRefresh={refresh}
                    notify={notify}
                    navigate={navigate}
                    onSelect={setSelected}
                  />
                )}
                {(view === "queue" || view === "library") && (
                  <JobsView
                    data={data}
                    library={view === "library"}
                    onSelect={setSelected}
                    navigate={navigate}
                  />
                )}
                {view === "schedule" && (
                  <ScheduleView data={data} refresh={refresh} notify={notify} />
                )}
                {view === "connections" && (
                  <ConnectionsView
                    data={data}
                    refresh={refresh}
                    notify={notify}
                  />
                )}
                {view === "settings" && (
                  <SettingsView data={data} refresh={refresh} notify={notify} />
                )}
                {view === "publishing" && (
                  <PublishingWorkspace
                    data={data}
                    openConnections={() => navigate("connections")}
                    notify={notify}
                  />
                )}
                {view === "analytics" && (
                  <AnalyticsView data={data} navigate={navigate} />
                )}
              </>
            )
          )}
        </main>
        <footer className="app-footer">
          <span>
            <Mark small />
            Made for stories that matter.
          </span>
          <span>
            Asia/Manila <span className="footer-dot">·</span> Generate with
            intention.
          </span>
        </footer>
      </div>
      {notice && (
        <div className={`toast ${notice.error ? "error" : ""}`} role="status">
          {notice.error ? (
            <AlertCircle size={18} />
          ) : (
            <CheckCircle2 size={18} />
          )}
          <span>{notice.text}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {selected && (
        <JobDetail
          job={selected}
          onClose={() => setSelected(null)}
          action={jobAction}
          refresh={refresh}
          notify={notify}
        />
      )}
      {searchOpen && (
        <div className="modal-shade" onClick={() => setSearchOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search workspace"
            className="search-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="search-field">
              <Search size={20} />
              <input
                autoFocus
                placeholder="Search your workspace…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>ESC</kbd>
            </div>
            <div className="search-results">
              {Object.entries(viewNames)
                .filter(([, n]) =>
                  n.toLowerCase().includes(search.toLowerCase()),
                )
                .map(([id, name]) => (
                  <button
                    key={id}
                    onClick={() => {
                      navigate(id as View);
                      setSearchOpen(false);
                    }}
                  >
                    <FolderOpen size={17} />
                    <span>{name}</span>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              {data?.jobs
                .filter((j) =>
                  (j.title + " " + j.prompt)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((j) => (
                  <button
                    key={j.id}
                    onClick={() => {
                      setSelected(j);
                      setSearchOpen(false);
                    }}
                  >
                    <Film size={17} />
                    <span>{j.title || j.prompt}</span>
                    <span className="muted">Story</span>
                  </button>
                ))}
            </div>
            <div className="search-footer">
              <Command size={13} />K to open search
            </div>
          </div>
        </div>
      )}
      {help && (
        <div className="modal-shade" onClick={() => setHelp(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Getting started"
            className="dialog help-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="dialog-close icon-button"
              aria-label="Close help"
              onClick={() => setHelp(false)}
            >
              <X size={19} />
            </button>
            <span className="large-icon">
              <BookOpen size={25} />
            </span>
            <h2>A story studio, made for you.</h2>
            <p>
              Start with an idea, add your references, and let one connected
              workflow take it from research to video.
            </p>
            <ol className="help-steps">
              <li>
                <strong>Set up your providers</strong>
                <span>
                  Configure research, writing, and narration in the server
                  environment. Connections shows exactly what is still needed.
                </span>
              </li>
              <li>
                <strong>Create your first story</strong>
                <span>
                  Enter a real story idea or upload your own narration. Your
                  saved job includes sources, progress, and any required next
                  steps.
                </span>
              </li>
              <li>
                <strong>Build a daily rhythm</strong>
                <span>
                  Save your three generation slots and start the worker. Review
                  videos before approving a destination.
                </span>
              </li>
            </ol>
            <button
              className="primary-button"
              onClick={() => {
                setHelp(false);
                navigate("connections");
              }}
            >
              Open connections <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type SharedProps = {
  data: DashboardData;
  refresh: () => Promise<void>;
  notify: (text: string, error?: boolean) => void;
};
function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
function Overview({
  data,
  onRefresh,
  notify,
  navigate,
  onSelect,
}: {
  data: DashboardData;
  onRefresh: () => Promise<void>;
  notify: (s: string, e?: boolean) => void;
  navigate: (v: View) => void;
  onSelect: (j: Job) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("Rags to Riches");
  const [platforms, setPlatforms] = useState<Platform[]>([
    "youtube",
    "facebook",
    "tiktok",
  ]);
  const [mode, setMode] = useState<"prompt" | "audio">("prompt");
  const [advanced, setAdvanced] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [duration, setDuration] = useState(data.settings.duration);
  const [language, setLanguage] = useState(data.settings.language);
  const [voice, setVoice] = useState(data.settings.voice);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [narration, setNarration] = useState<{
    narrationId: string;
    filename: string;
    duration: number;
    url?: string;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const requestKey = useRef<string | null>(null);
  const ready = data.jobs.filter((j) =>
    ["READY_TO_PUBLISH", "READY_FOR_MANUAL_TIKTOK_POST"].includes(j.status),
  ).length;
  const connected = data.connections.filter(
    (c) => c.id !== "canva" && c.connected,
  ).length;
  async function generate() {
    if (busy || !prompt.trim()) return;
    setBusy(true);
    requestKey.current ||= crypto.randomUUID();
    try {
      const result = await api<{ job: Job }>("/api/stories/generate", {
        method: "POST",
        body: JSON.stringify({
          prompt,
          genre,
          language,
          duration,
          voice,
          platforms,
          sourceUrl: sourceUrl || undefined,
          narrationId: narration?.narrationId,
          idempotencyKey: requestKey.current,
        }),
      });
      requestKey.current = null;
      notify("Your story is saved. Follow its progress in the queue.");
      await onRefresh();
      onSelect(result.job);
      setPrompt("");
      setNarration(null);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const n = await api<{
        narrationId: string;
        filename: string;
        duration: number;
        url?: string;
      }>("/api/stories/upload-narration", { method: "POST", body: form });
      setNarration(n);
      notify("Narration uploaded. Your original audio is preserved.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setUploading(false);
    }
  }
  return (
    <>
      <div className="overview-heading">
        <div>
          <div className="eyebrow">
            <span className="tiny-spark">✳</span> YOUR PERSONAL STORY STUDIO
          </div>
          <h1>
            Every great story
            <br />
            starts with an idea<span className="heading-dot">.</span>
          </h1>
          <p>Turn real stories into videos that move people.</p>
        </div>
        <div className="date-chip">
          <CalendarDays size={15} />
          {new Intl.DateTimeFormat("en-PH", {
            month: "short",
            day: "numeric",
            timeZone: "Asia/Manila",
          }).format(new Date())}
          <span className="muted">Manila time</span>
        </div>
      </div>
      <div className="creation-grid">
        <section className="composer card">
          <div className="composer-tabs">
            <div role="tablist" aria-label="Story input mode">
              <button
                role="tab"
                aria-selected={mode === "prompt"}
                className={mode === "prompt" ? "active" : ""}
                onClick={() => setMode("prompt")}
              >
                <SquarePen size={15} />
                Write a prompt
              </button>
              <button
                role="tab"
                aria-selected={mode === "audio"}
                className={mode === "audio" ? "active" : ""}
                onClick={() => setMode("audio")}
              >
                <AudioLines size={16} />
                Upload narration
              </button>
            </div>
            <span className="manual-label">
              <span />
              Manual run
            </span>
          </div>
          <div className="composer-body">
            <div className="composer-title">
              <span className="sparkle-tile">
                <Sparkles size={18} />
              </span>
              <h2>What story are we telling today?</h2>
            </div>
            {mode === "audio" && (
              <>
                <input
                  className="visually-hidden"
                  type="file"
                  accept="audio/wav,audio/mpeg,.wav,.mp3"
                  ref={fileRef}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(f);
                  }}
                />
                <button
                  className={`audio-drop ${narration ? "has-audio" : ""}`}
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 size={23} className="spin" />
                  ) : narration ? (
                    <CheckCircle2 size={24} />
                  ) : (
                    <FileAudio size={25} />
                  )}
                  <span>
                    <strong>
                      {uploading
                        ? "Uploading narration…"
                        : narration
                          ? narration.filename
                          : "Choose your narration"}
                    </strong>
                    <small>
                      {narration
                        ? `${Math.floor(narration.duration / 60)}:${String(Math.round(narration.duration % 60)).padStart(2, "0")} · Original audio preserved`
                        : "WAV or MP3 · up to 100 MB"}
                    </small>
                  </span>
                  <Upload size={17} />
                </button>
                {narration?.url && (
                  <audio
                    controls
                    src={narration.url}
                    className="audio-player"
                  />
                )}
              </>
            )}
            <textarea
              id="story-prompt"
              aria-label="Story prompt"
              placeholder={
                mode === "prompt"
                  ? "A small beginning. An impossible dream. A turning point.\nTell us who or what you want to bring to life…"
                  : "Tell us the story behind your narration. Add context and sources…"
              }
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                requestKey.current = null;
              }}
              maxLength={4000}
            />
            <div className="preset-label">A little inspiration</div>
            <div className="preset-chips">
              {genres.slice(0, 4).map((g, i) => (
                <button
                  key={g}
                  className={genre === g ? "selected" : ""}
                  onClick={() => {
                    setGenre(g);
                    if (!prompt || Object.values(prompts).includes(prompt))
                      setPrompt(prompts[g]);
                    requestKey.current = null;
                  }}
                >
                  {
                    [
                      <Zap size={13} key="z" />,
                      <Globe size={13} key="g" />,
                      <Sparkles size={13} key="s" />,
                      <BookOpen size={13} key="b" />,
                    ][i]
                  }
                  {g === "Inspirational Real Story" ? "Real Inspiration" : g}
                </button>
              ))}
            </div>
          </div>
          <div className="composer-options">
            <button
              onClick={() => setAdvanced(!advanced)}
              className="options-button"
            >
              <SlidersHorizontal size={15} />
              <span>
                {language} <span>·</span> {Math.round(duration / 60)} min{" "}
                <span>·</span> {voice === "natural" ? "Natural voice" : voice}
              </span>
              <ChevronDown size={13} className={advanced ? "rotate" : ""} />
            </button>
            <button
              className={`source-button ${sourceUrl ? "has-source" : ""}`}
              title="Add a source reference"
              onClick={() => setAdvanced(!advanced)}
            >
              <Link2 size={16} />
              <span>Add source</span>
            </button>
          </div>
          {advanced && (
            <div className="advanced-fields">
              <label className="field-label full">
                Reference URL
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://…"
                />
              </label>
              <label className="field-label">
                Language
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option>Taglish</option>
                  <option>Filipino</option>
                  <option>English</option>
                </select>
              </label>
              <label className="field-label">
                Target duration
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                >
                  <option value={300}>5 minutes</option>
                  <option value={180}>3 minutes</option>
                  <option value={60}>1 minute</option>
                </select>
              </label>
              <label className="field-label">
                Voice
                <input
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  placeholder="natural"
                />
                <small>
                  natural uses the server default: Riko when Gemini TTS is
                  configured.
                </small>
              </label>
              <label className="field-label">
                Story category
                <select
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                >
                  {genres.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="composer-footer">
            <div className="destination-picker">
              <span>Create for</span>
              {(["youtube", "facebook", "tiktok"] as Platform[]).map((p) => (
                <button
                  key={p}
                  aria-label={`${platforms.includes(p) ? "Remove" : "Add"} ${platformLabel[p]}`}
                  aria-pressed={platforms.includes(p)}
                  className={`platform-toggle ${platforms.includes(p) ? "selected" : ""}`}
                  onClick={() =>
                    setPlatforms(
                      platforms.includes(p)
                        ? platforms.filter((x) => x !== p)
                        : [...platforms, p],
                    )
                  }
                >
                  <PlatformIcon platform={p} />
                </button>
              ))}
            </div>
            <button
              className="generate-button"
              onClick={generate}
              disabled={
                busy ||
                !prompt.trim() ||
                !platforms.length ||
                (mode === "audio" && !narration)
              }
            >
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Sparkles size={16} />
              )}
              <span>{busy ? "Creating story…" : "Generate story"}</span>
              <ArrowUp size={16} />
            </button>
          </div>
          <div className="composer-caption">
            <ShieldCheck size={12} />
            Your story is saved for review. Publishing is a separate step.
          </div>
        </section>
        <aside className="autopilot-card">
          <div className="autopilot-top">
            <span className="dark-icon">
              <CalendarDays size={19} />
            </span>
            <span className="autopilot-badge">
              <span
                className={data.schedule.enabled ? "green-dot" : "gray-dot"}
              />
              {data.schedule.enabled ? "Enabled" : "On your terms"}
            </span>
          </div>
          <h2>
            Your stories.
            <br />
            On a daily rhythm.
          </h2>
          <p>
            Three moments a day.
            <br />A fresh story in every one.
          </p>
          <div className="rhythm-lines" aria-hidden="true">
            <div />
            <div />
            <div />
            <span>✳</span>
          </div>
          <div className="time-slots">
            {data.schedule.slots.map((s, i) => (
              <div key={s.id}>
                <span className="slot-number">0{i + 1}</span>
                <span className="slot-name">
                  {["Morning story", "Afternoon story", "Evening story"][i] ||
                    "Daily story"}
                </span>
                <strong>{s.time}</strong>
                <span className={`slot-indicator ${s.enabled ? "" : "off"}`} />
              </div>
            ))}
          </div>
          <div className="autopilot-bottom">
            <span>
              <Globe size={12} />
              {data.schedule.timezone}
            </span>
            <button onClick={() => navigate("schedule")}>
              Manage schedule <ArrowUpRight size={14} />
            </button>
          </div>
        </aside>
      </div>
      <div className="overview-stats">
        <Stat
          icon={<Clapperboard size={20} />}
          value={String(data.jobs.length)}
          label="Stories created"
          detail="Every idea, kept in one place"
        />
        <Stat
          icon={<CheckCheck size={20} />}
          value={String(ready)}
          label="Ready for their moment"
          detail="Reviewed videos ready to share"
        />
        <Stat
          icon={<Radio size={20} />}
          value={`${connected}`}
          suffix="/ 3"
          label="Connected channels"
          detail={
            connected
              ? "Your publishing destinations"
              : "Connect when you’re ready"
          }
          onClick={() => navigate("connections")}
        />
      </div>
      <section className="stories-section">
        <div className="section-heading">
          <div>
            <h2>
              Your recent stories{" "}
              <span className="count-pill">{data.jobs.length}</span>
            </h2>
            <p>A little progress, a new possibility.</p>
          </div>
          <button className="text-button" onClick={() => navigate("library")}>
            View library <ArrowRight size={15} />
          </button>
        </div>
        {data.jobs.length ? (
          <div className="recent-jobs">
            {data.jobs.slice(0, 4).map((j) => (
              <JobRow job={j} key={j.id} onClick={() => onSelect(j)} />
            ))}
          </div>
        ) : (
          <div className="empty-stories">
            <div className="empty-stack">
              <div />
              <div />
              <span>
                <Film size={25} strokeWidth={1.3} />
              </span>
            </div>
            <div>
              <h3>A blank page, full of possibility.</h3>
              <p>
                Your first story will find its home here.
                <br />
                Start with an idea above — we’ll take it from there.
              </p>
            </div>
            <span className="empty-arrow" aria-hidden="true">
              ↗
            </span>
          </div>
        )}
      </section>
      <div className="workflow-strip">
        <div className="workflow-intro">
          <span className="workflow-spark">
            <WandSparkles size={17} />
          </span>
          <span>
            One idea. <strong>A whole production.</strong>
          </span>
        </div>
        <div className="workflow-steps">
          {["Research", "Write", "Narrate", "Create", "Share"].map((s, i) => (
            <span key={s}>
              {s}
              {i < 4 && <ChevronRight size={12} />}
            </span>
          ))}
        </div>
        <button
          className="icon-button"
          aria-label="View production queue"
          onClick={() => navigate("queue")}
        >
          <ArrowUpRight size={17} />
        </button>
      </div>
    </>
  );
}
function Stat({
  icon,
  value,
  suffix,
  label,
  detail,
  onClick,
}: {
  icon: React.ReactNode;
  value: string;
  suffix?: string;
  label: string;
  detail: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`stat-card ${onClick ? "clickable" : ""}`}
      onClick={onClick}
    >
      <div className="stat-head">
        <span className="stat-icon">{icon}</span>
        <span className="stat-value">
          {value}
          <small>{suffix}</small>
        </span>
        {onClick && <ArrowUpRight size={16} className="stat-arrow" />}
      </div>
      <strong>{label}</strong>
      <p>{detail}</p>
    </div>
  );
}
function JobRow({ job: j, onClick }: { job: Job; onClick: () => void }) {
  return (
    <button className="job-row" onClick={onClick}>
      <span className={`job-thumb ${isBlocked(j) ? "attention" : ""}`}>
        <Film size={22} strokeWidth={1.5} />
      </span>
      <span className="job-text">
        <strong>{j.title || j.prompt}</strong>
        <span>
          {j.genre} <span>·</span> {dateLabel(j.createdAt)} <span>·</span>{" "}
          {j.trigger === "manual" ? "Manual" : "Scheduled"}
        </span>
      </span>
      <span
        className={`status-pill ${isBlocked(j) ? "warning" : j.status === "PUBLISHED" ? "success" : ""}`}
      >
        <span />
        {statusLabel(j.status)}
      </span>
      <span className="job-platforms">
        {j.platforms.map((p) => (
          <PlatformIcon platform={p} key={p} size={14} />
        ))}
      </span>
      <ChevronRight size={16} />
    </button>
  );
}
function JobsView({
  data,
  library,
  onSelect,
  navigate,
}: {
  data: DashboardData;
  library: boolean;
  onSelect: (j: Job) => void;
  navigate: (v: View) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const jobs = data.jobs.filter(
    (j) =>
      (filter === "all" ||
        (filter === "attention" && isBlocked(j)) ||
        (filter === "finished" &&
          [
            "PUBLISHED",
            "READY_TO_PUBLISH",
            "READY_FOR_MANUAL_TIKTOK_POST",
          ].includes(j.status)) ||
        (filter === "active" &&
          !isBlocked(j) &&
          !["CANCELLED", "PUBLISHED", "FAILED"].includes(j.status))) &&
      (j.title + " " + j.prompt).toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow={library ? "YOUR STORY ARCHIVE" : "PRODUCTION WORKSPACE"}
        title={
          library
            ? "Your stories, all together."
            : "Good things are in the making."
        }
        description={
          library
            ? "Every idea, source, script, and finished video. Right where you left it."
            : "Follow every story from its first source to its final frame."
        }
      >
        <button className="primary-button" onClick={() => navigate("overview")}>
          <Plus size={16} />
          New story
        </button>
      </PageHeading>
      <div className="list-toolbar">
        <div className="filter-tabs">
          {[
            ["all", "All stories"],
            ["active", "In progress"],
            ["attention", "Needs attention"],
            ["finished", "Finished"],
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={filter === k ? "active" : ""}
            >
              {l}
              {k === "all" && <span>{data.jobs.length}</span>}
            </button>
          ))}
        </div>
        <div className="small-search">
          <Search size={15} />
          <input
            aria-label="Search stories"
            placeholder="Search stories"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      {!library && (
        <div className="pipeline-strip">
          {stages.map((s, i) => (
            <div key={s}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {s}
              {i < stages.length - 1 && <ChevronRight size={13} />}
            </div>
          ))}
        </div>
      )}
      <div className="card queue-card">
        {jobs.length ? (
          jobs.map((j) => (
            <JobRow key={j.id} job={j} onClick={() => onSelect(j)} />
          ))
        ) : (
          <Empty
            icon={<Clapperboard size={30} strokeWidth={1.3} />}
            title={
              q
                ? "No matching stories."
                : "Something worth telling starts here."
            }
            description={
              q
                ? "Try another title or search term."
                : "Create a story and watch its sources, script, narration, and video come together."
            }
            action={
              <button
                className="secondary-button"
                onClick={() => navigate("overview")}
              >
                <Plus size={15} />
                Create a story
              </button>
            }
          />
        )}
      </div>
    </>
  );
}
function Empty({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

function ScheduleView({ data, refresh, notify }: SharedProps) {
  const [form, setForm] = useState<Schedule>(data.schedule);
  const [busy, setBusy] = useState(false);
  const times = upcoming(form);
  async function save() {
    setBusy(true);
    try {
      await api("/api/schedules", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      notify("Your daily rhythm is saved.");
      await refresh();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  function updateSlot(
    index: number,
    patch: Partial<Schedule["slots"][number]>,
  ) {
    setForm({
      ...form,
      slots: form.slots.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    });
  }
  return (
    <>
      <PageHeading
        eyebrow="YOUR DAILY RHYTHM"
        title="Make room for great stories."
        description="Three unique stories a day. A manual idea whenever inspiration strikes."
      >
        <button className="primary-button" disabled={busy} onClick={save}>
          {busy ? <Loader2 className="spin" size={16} /> : <Check size={16} />}
          Save schedule
        </button>
      </PageHeading>
      <section className="card schedule-control">
        <div className="section-heading">
          <div className="icon-title">
            <span className="large-icon">
              <CalendarDays size={23} />
            </span>
            <div>
              <h2>Daily generation</h2>
              <p>Create stories automatically at your chosen times.</p>
            </div>
          </div>
          <Toggle
            checked={form.enabled}
            label="Enable daily generation"
            onChange={(enabled) => setForm({ ...form, enabled })}
          />
        </div>
        <div className="schedule-meta">
          <label className="field-label">
            Timezone
            <select
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            >
              {[
                "Asia/Manila",
                "Asia/Singapore",
                "Asia/Tokyo",
                "UTC",
                "America/New_York",
                "America/Los_Angeles",
                "Europe/London",
              ].map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </label>
          <span>
            <Clock size={15} />
            {form.enabled
              ? "Your next stories are on the calendar."
              : "Save and enable when your studio is ready."}
          </span>
        </div>
      </section>
      <div className="schedule-cards">
        {form.slots.map((s, i) => (
          <div
            className={`card schedule-slot ${!s.enabled ? "disabled-slot" : ""}`}
            key={s.id}
          >
            <div className="slot-card-top">
              <span className="slot-eyebrow">STORY 0{i + 1}</span>
              <Toggle
                checked={s.enabled}
                label={`Enable slot ${i + 1}`}
                onChange={(enabled) => updateSlot(i, { enabled })}
              />
            </div>
            <label className="slot-time-label">
              <input
                aria-label={`Time for slot ${i + 1}`}
                type="time"
                value={s.time}
                onChange={(e) => updateSlot(i, { time: e.target.value })}
              />
            </label>
            <p className="slot-period">
              {
                [
                  "A little morning inspiration",
                  "An afternoon perspective",
                  "A story to end the day",
                ][i]
              }
            </p>
            <label className="field-label">
              Story category
              <select
                value={s.genre}
                onChange={(e) => updateSlot(i, { genre: e.target.value })}
              >
                {genres.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <div className="field-label">Create variants for</div>
            <div className="slot-platforms">
              {(["youtube", "facebook", "tiktok"] as Platform[]).map((p) => (
                <button
                  className={s.platforms.includes(p) ? "selected" : ""}
                  key={p}
                  aria-pressed={s.platforms.includes(p)}
                  onClick={() =>
                    updateSlot(i, {
                      platforms: s.platforms.includes(p)
                        ? s.platforms.filter((x) => x !== p)
                        : [...s.platforms, p],
                    })
                  }
                >
                  <PlatformIcon platform={p} size={15} />
                  {platformLabel[p]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="settings-columns">
        <section className="card settings-section">
          <h2>Generation & publishing</h2>
          <p>Choose what happens after a story is created.</p>
          <label className="field-label">
            Publication policy
            <select
              value={form.generationMode}
              onChange={(e) =>
                setForm({
                  ...form,
                  generationMode: e.target.value as Schedule["generationMode"],
                })
              }
            >
              <option value="GENERATE_ONLY">Generate only</option>
              <option value="APPROVAL_REQUIRED">Require approval</option>
              <option value="AUTO_PUBLISH_WHEN_ELIGIBLE">
                Auto-publish when eligible
              </option>
            </select>
          </label>
          <div className="inline-note">
            <ShieldCheck size={17} />
            <span>
              Scheduled generation and publishing are separate. TikTok always
              requires per-post review and consent.
            </span>
          </div>
          <label className="field-label">
            If a run is missed
            <select
              value={form.missedRunPolicy}
              onChange={(e) =>
                setForm({
                  ...form,
                  missedRunPolicy: e.target
                    .value as Schedule["missedRunPolicy"],
                })
              }
            >
              <option value="skip_missed">Skip missed runs</option>
              <option value="catch_up_one">Catch up the latest run</option>
              <option value="catch_up_all">
                Catch up recent runs (limited)
              </option>
            </select>
          </label>
        </section>
        <section className="card settings-section">
          <h2>Next on the calendar</h2>
          <p>
            {form.timezone} · saved slots run independently of manual stories.
          </p>
          <div className="upcoming-list">
            {times.map((s, i) => (
              <div key={s.id}>
                <span className="upcoming-number">{i + 1}</span>
                <span>
                  <strong>{s.genre}</strong>
                  <small>
                    {s.tomorrow ? "Tomorrow" : "Today"} · {form.timezone}
                  </small>
                </span>
                <strong>{s.time}</strong>
              </div>
            ))}
            {!times.length && (
              <p>Enable a slot to see upcoming generation times.</p>
            )}
          </div>
          <div
            className={`worker-note ${data.health.worker === "online" ? "healthy" : ""}`}
          >
            <span className="tiny-dot" />
            <span>
              Worker {data.health.worker}
              {data.health.lastHeartbeat
                ? ` · last seen ${dateLabel(data.health.lastHeartbeat)}`
                : " · start the worker to run schedules"}
            </span>
          </div>
        </section>
      </div>
    </>
  );
}
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
function ConnectionsView({ data, refresh, notify }: SharedProps) {
  const [busy, setBusy] = useState("");
  async function connect(c: Connection) {
    setBusy(c.id);
    try {
      const r = await api<{ url: string }>(`/api/connections/${c.id}/connect`, {
        method: "POST",
      });
      if (r.url) window.location.assign(r.url);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }
  async function disconnect(c: Connection) {
    setBusy(c.id);
    try {
      await api(`/api/connections/${c.id}`, { method: "DELETE" });
      notify(`${c.name} disconnected.`);
      refresh();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="A CONNECTED STUDIO"
        title="Your tools. Working together."
        description="Connect the accounts that bring your stories to life and send them into the world."
      />
      <div className="connections-grid">
        {data.connections.map((c) => (
          <section className="card connection-card" key={c.id}>
            <div className="connection-top">
              <span className={`service-icon service-${c.id}`}>
                <PlatformIcon platform={c.id} size={26} />
              </span>
              <span className={`status-pill ${c.connected ? "success" : ""}`}>
                <span />
                {c.connected
                  ? "Connected"
                  : c.configured
                    ? "Ready to connect"
                    : "Setup needed"}
              </span>
            </div>
            <h2>{c.name}</h2>
            <p>{c.description}</p>
            {c.accountName && (
              <div className="account-name">
                <CheckCircle2 size={14} />
                {c.accountName}
              </div>
            )}
            <div className="connection-detail">
              <strong>
                {c.connected
                  ? "Account authorized"
                  : c.configured
                    ? "One more step"
                    : "Before you connect"}
              </strong>
              <p>
                {c.blocker ||
                  (c.connected
                    ? "Your authorized account is available to this studio."
                    : "Authorize access to connect this account.")}
              </p>
            </div>
            <details className="scope-details">
              <summary>
                Required permissions <ChevronDown size={13} />
              </summary>
              <div>
                {c.scopes.map((s) => (
                  <code key={s}>{s}</code>
                ))}
              </div>
            </details>
            <button
              className={c.connected ? "secondary-button" : "primary-button"}
              disabled={busy === c.id}
              onClick={() => (c.connected ? disconnect(c) : connect(c))}
            >
              {busy === c.id ? (
                <Loader2 className="spin" size={16} />
              ) : c.connected ? (
                <Link2 size={16} />
              ) : (
                <Plus size={16} />
              )}{" "}
              {c.connected
                ? "Disconnect"
                : `Connect ${platformLabel[c.id] || c.name}`}
              <ArrowUpRight size={15} />
            </button>
          </section>
        ))}
      </div>
      <div className="inline-note connection-note">
        <ShieldCheck size={20} />
        <span>
          Your credentials stay on the server. Each destination has its own
          approval and publishing requirements. Canva stock access depends on
          the capabilities granted to your app.
        </span>
      </div>
      <section className="card provider-health">
        <div>
          <h2>Provider configuration</h2>
          <p>Configured services still require a successful provider request.</p>
          <p>Writing: {data.health.writingProvider}{data.health.writingModel ? ` · ${data.health.writingModel}` : ""}{data.health.writingFallbackConfigured ? " · fallback configured" : ""}</p>
        </div>
        <div>
          {[
            ["Writing", data.health.llm],
            ["Research", data.health.research],
            ["Narration", data.health.tts],
            ["Worker", data.health.worker === "online"],
          ].map(([name, ready]) => (
            <span key={String(name)}>
              <span className={`health-dot ${ready ? "ready" : ""}`} />
              {name}
              <small>{ready ? name === "Worker" ? "Online" : "Configured" : "Setup needed"}</small>
            </span>
          ))}
        </div>
      </section>
    </>
  );
}
function SettingsView({ data, refresh, notify }: SharedProps) {
  const [form, setForm] = useState<Settings>(data.settings);
  const [saving, setSaving] = useState(false);
  function patch(p: Partial<Settings>) {
    setForm({ ...form, ...p });
  }
  async function save() {
    setSaving(true);
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify(form) });
      notify("Studio preferences saved.");
      await refresh();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="MAKE IT YOURS"
        title="A studio that sounds like you."
        description="Set your creative defaults, review preferences, and production limits."
      >
        <button className="primary-button" disabled={saving} onClick={save}>
          {saving ? (
            <Loader2 className="spin" size={16} />
          ) : (
            <Check size={16} />
          )}
          Save preferences
        </button>
      </PageHeading>
      <div className="settings-columns">
        <section className="card settings-section">
          <h2>Story & voice</h2>
          <p>The starting point for every new story.</p>
          <label className="field-label">
            Default language
            <select
              value={form.language}
              onChange={(e) => patch({ language: e.target.value })}
            >
              <option>Taglish</option>
              <option>Filipino</option>
              <option>English</option>
            </select>
          </label>
          <label className="field-label">
            Target duration
            <select
              value={form.duration}
              onChange={(e) => patch({ duration: Number(e.target.value) })}
            >
              <option value={300}>5 minutes</option>
              <option value={180}>3 minutes</option>
              <option value={60}>1 minute</option>
            </select>
          </label>
          <label className="field-label">
            Voice identifier
            <input
              value={form.voice}
              onChange={(e) => patch({ voice: e.target.value })}
            />
            <small>Use a voice supported by your narration provider. natural uses Riko when Gemini TTS is configured.</small>
          </label>
          <label className="field-label">
            Editorial review
            <select
              value={form.approvalMode}
              onChange={(e) =>
                patch({
                  approvalMode: e.target.value as Settings["approvalMode"],
                })
              }
            >
              <option value="all">Review every story</option>
              <option value="review_high_risk">
                Review stories with editorial risks
              </option>
              <option value="off">Automatic quality gates only</option>
            </select>
          </label>
        </section>
        <section className="card settings-section">
          <h2>Production guardrails</h2>
          <p>A comfortable pace, with you in control.</p>
          <label className="field-label">
            Daily scheduled production cap
            <input
              type="number"
              min={1}
              max={30}
              value={form.dailyCap}
              onChange={(e) => patch({ dailyCap: Number(e.target.value) })}
            />
          </label>
          <label className="field-label">
            Concurrent jobs
            <input
              type="number"
              min={1}
              max={4}
              value={form.concurrentJobs}
              onChange={(e) =>
                patch({ concurrentJobs: Number(e.target.value) })
              }
            />
          </label>
          <label className="field-label">
            Daily budget limit (USD)
            <input
              type="number"
              min={0}
              max={1000}
              step="0.5"
              value={form.budgetLimit}
              onChange={(e) => patch({ budgetLimit: Number(e.target.value) })}
            />
            <small>
              Paid operations require provider-specific cost enforcement.
            </small>
          </label>
          <div className="settings-toggle">
            <div>
              <strong>Allow eligible auto-publishing</strong>
              <small>
                Requires account authorization and reviewed content.
              </small>
            </div>
            <Toggle
              label="Allow auto-publishing"
              checked={form.autoPublish}
              onChange={(autoPublish) => patch({ autoPublish })}
            />
          </div>
          <div className="inline-note">
            <ShieldCheck size={17} />
            <span>
              TikTok privacy and consent remain under your control for every
              post.
            </span>
          </div>
        </section>
      </div>
      <div className="card system-card">
        <span className="large-icon">
          <Monitor size={23} />
        </span>
        <div>
          <h2>Your local workspace</h2>
          <p>
            Persistent storage · {data.health.database} · {data.health.storage}
          </p>
        </div>
        <span className="status-pill">
          <span />
          {data.health.worker === "online" ? "Worker online" : "Worker offline"}
        </span>
      </div>
    </>
  );
}
function AnalyticsView({
  data,
  navigate,
}: {
  data: DashboardData;
  navigate: (v: View) => void;
}) {
  const done = data.jobs.filter((j) => j.status === "PUBLISHED").length;
  const blocked = data.jobs.filter(isBlocked).length;
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE PERSPECTIVE"
        title="See the story behind your stories."
        description="Real production activity today. Audience insights when your accounts support them."
      />
      <div className="overview-stats">
        <Stat
          icon={<Film size={20} />}
          value={String(data.jobs.length)}
          label="Total stories"
          detail="Saved in your studio"
        />
        <Stat
          icon={<CheckCheck size={20} />}
          value={String(done)}
          label="Published stories"
          detail="Verified destination results"
        />
        <Stat
          icon={<AlertCircle size={20} />}
          value={String(blocked)}
          label="Need your attention"
          detail="Clear next steps in the queue"
          onClick={() => navigate("queue")}
        />
      </div>
      <div className="card">
        <Empty
          icon={<BarChart3 size={31} strokeWidth={1.3} />}
          title="Your audience is more than a number."
          description="Connect an authorized analytics source to see views, watch time, retention, engagement, and follower growth. Unavailable metrics stay unavailable."
          action={
            <button
              className="secondary-button"
              onClick={() => navigate("connections")}
            >
              <Link2 size={16} />
              Connect your channels
            </button>
          }
        />
      </div>
      <div className="analytics-unavailable">
        {["Views", "Average retention", "Watch time", "Production cost"].map(
          (x) => (
            <div key={x}>
              <span>{x}</span>
              <strong>—</strong>
              <small>Unavailable</small>
            </div>
          ),
        )}
      </div>
    </>
  );
}
function JobDetail({
  job: j,
  onClose,
  action,
  refresh,
  notify,
}: {
  job: Job;
  onClose: () => void;
  action: (j: Job, a: string) => void;
  refresh: () => Promise<void>;
  notify: (s: string, e?: boolean) => void;
}) {
  const [tab, setTab] = useState("activity");
  const artifacts = Object.entries(j.artifacts);
  return (
    <div className="detail-shade" onClick={onClose}>
      <aside
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Story details"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-top">
          <span>
            <Film size={17} />
            Story workspace
          </span>
          <button
            className="icon-button"
            aria-label="Close story details"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="detail-body">
          <span className={`status-pill ${isBlocked(j) ? "warning" : ""}`}>
            <span />
            {statusLabel(j.status)}
          </span>
          <h2>{j.title || j.prompt}</h2>
          <p className="detail-meta">
            {j.genre} · {j.language} · {Math.round(j.duration / 60)} min ·{" "}
            {j.trigger}
          </p>
          <div className="detail-progress">
            <span>
              Production progress <strong>{j.progress}%</strong>
            </span>
            <div>
              <span style={{ width: `${j.progress}%` }} />
            </div>
          </div>
          {j.blocker && (
            <div className="blocker-box">
              <AlertCircle size={19} />
              <div>
                <strong>One thing before we continue</strong>
                <p>{j.blocker}</p>
              </div>
            </div>
          )}
          <div className="detail-actions">
            <a className="secondary-button" href={`/story-card.html?jobId=${encodeURIComponent(j.id)}`}>
              <Layers size={14} /> Story Cards
            </a>
            {!["PUBLISHED", "CANCELLED"].includes(j.status) && (
              <>
                <button
                  className="secondary-button"
                  disabled={[
                    "QUEUED",
                    "RETRYING",
                    "RESEARCHING",
                    "SCRIPTED",
                    "NARRATING",
                    "SELECTING_ASSETS",
                    "EDITING",
                    "QA",
                    "PUBLISHING",
                  ].includes(j.status)}
                  onClick={() => action(j, "retry")}
                >
                  <RefreshCw size={14} />
                  Retry
                </button>
                <button
                  className="secondary-button"
                  disabled={
                    ![
                      "PAUSED",
                      "QUEUED",
                      "RETRYING",
                      "RESEARCHING",
                      "SCRIPTED",
                      "NARRATING",
                      "SELECTING_ASSETS",
                      "EDITING",
                      "QA",
                    ].includes(j.status)
                  }
                  onClick={() =>
                    action(j, j.status === "PAUSED" ? "resume" : "pause")
                  }
                >
                  {j.status === "PAUSED" ? (
                    <Play size={14} />
                  ) : (
                    <Pause size={14} />
                  )}{" "}
                  {j.status === "PAUSED" ? "Resume" : "Pause"}
                </button>
                <button
                  className="text-button danger"
                  onClick={() => action(j, "cancel")}
                >
                  <X size={14} />
                  Cancel
                </button>
              </>
            )}
          </div>
          <div className="detail-tabs">
            {["activity", "sources", "script", "files"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={tab === t ? "active" : ""}
              >
                {t === "files" ? "Artifacts" : statusLabel(t)}
              </button>
            ))}
          </div>
          {tab === "activity" && (
            <div className="activity-list">
              {j.events.map((e, i) => (
                <div key={i}>
                  <span className="activity-dot" />
                  <div>
                    <strong>{statusLabel(e.stage)}</strong>
                    <p>{e.message}</p>
                    <small>{dateLabel(e.at)}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === "sources" && (
            <div className="source-list">
              {j.sources.length ? (
                j.sources.map((s, i) => (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    key={i}
                  >
                    <div>
                      <Globe size={17} />
                      <strong>{s.title}</strong>
                      <ExternalLink size={14} />
                    </div>
                    <p>{s.excerpt}</p>
                    <small>{new URL(s.url).hostname}</small>
                  </a>
                ))
              ) : (
                <p className="detail-empty">
                  Verified sources will appear after research completes.
                </p>
              )}
            </div>
          )}
          {tab === "script" && (
            <ScriptEditor job={j} refresh={refresh} notify={notify} />
          )}
          {tab === "files" && (
            <div className="artifact-list">
              {artifacts.length ? (
                artifacts.map(([name, url]) => (
                  <div key={name}>
                    {/\.mp4(?:\?|$)/.test(url) && (
                      <video controls src={url} preload="metadata" />
                    )}
                    {/\.(wav|mp3)(?:\?|$)/.test(url) && (
                      <audio controls src={url} />
                    )}
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                    >
                      <FolderOpen size={17} />
                      <span>{name}</span>
                      <Download size={16} />
                    </a>
                  </div>
                ))
              ) : (
                <p className="detail-empty">
                  Generated scripts, audio, captions, and videos will be kept
                  here.
                </p>
              )}
            </div>
          )}
          <div className="job-id">
            <span>Story ID</span>
            <code>{j.id}</code>
          </div>
        </div>
      </aside>
    </div>
  );
}
