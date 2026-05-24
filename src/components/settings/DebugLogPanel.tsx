import { useMemo, useState } from "react";
import {
  debugLogLevelPriority,
  useDebugLogStore,
  type DebugLogEntry,
  type DebugLogFilter,
} from "../../stores/debugLogStore";

const filterOptions: Array<{ id: DebugLogFilter; label: string }> = [
  { id: "error", label: "error" },
  { id: "warn", label: "warn+" },
  { id: "info", label: "info+" },
  { id: "debug", label: "debug+" },
  { id: "trace", label: "trace+" },
  { id: "all", label: "all" },
];

export function DebugLogPanel() {
  const entries = useDebugLogStore((state) => state.entries);
  const filter = useDebugLogStore((state) => state.filter);
  const setFilter = useDebugLogStore((state) => state.setFilter);
  const clearLogs = useDebugLogStore((state) => state.clearLogs);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const visibleEntries = useMemo(() => filterEntries(entries, filter), [entries, filter]);

  async function copyLogs() {
    try {
      await navigator.clipboard.writeText(formatLogDump(entries));
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1200);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 1600);
    }
  }

  return (
    <section className="debugLogPanel">
      <div className="debugLogHeader">
        <h3>Logs</h3>
        <small>{visibleEntries.length}/{entries.length}</small>
        <div className="buttonCluster">
          <button type="button" onClick={copyLogs} disabled={!entries.length}>
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Failed" : "Copy All"}
          </button>
          <button type="button" onClick={clearLogs}>Clear</button>
        </div>
      </div>
      <div className="logFilterBar" aria-label="Log level filter">
        {filterOptions.map((option) => (
          <button
            type="button"
            className={filter === option.id ? "active" : ""}
            key={option.id}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="logList">
        {visibleEntries.length ? (
          visibleEntries.map((entry) => (
            <article className={`logEntry ${entry.level}`} key={entry.id}>
              <span>{formatTime(entry.timestamp)}</span>
              <b>{entry.level}</b>
              <strong>{entry.category}</strong>
              <p>{entry.message}</p>
            </article>
          ))
        ) : (
          <p className="emptyState">{entries.length ? "No logs match this filter." : "No logs yet."}</p>
        )}
      </div>
    </section>
  );
}

function filterEntries(entries: DebugLogEntry[], filter: DebugLogFilter) {
  if (filter === "all") {
    return entries;
  }

  const maxPriority = debugLogLevelPriority[filter];
  return entries.filter((entry) => debugLogLevelPriority[entry.level] <= maxPriority);
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  const millis = date.getMilliseconds().toString().padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${millis}`;
}

function formatLogDump(entries: DebugLogEntry[]) {
  const header = [
    "kvm-portal logs",
    `exportedAt=${new Date().toISOString()}`,
    `userAgent=${navigator.userAgent}`,
    `url=${location.href}`,
    `visibility=${document.visibilityState}`,
    `logCount=${entries.length}`,
    "",
  ];

  const lines = entries.map((entry) =>
    JSON.stringify({
      ts: entry.isoTime,
      level: entry.level,
      category: entry.category,
      message: entry.message,
      details: sanitizeDetails(entry.details),
    }),
  );

  return [...header, ...lines].join("\n");
}

function sanitizeDetails(details: unknown) {
  if (details instanceof Error) {
    return { name: details.name, message: details.message, stack: details.stack };
  }

  try {
    JSON.stringify(details);
    return details;
  } catch {
    return String(details);
  }
}
