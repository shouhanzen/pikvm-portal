import { useDebugLogStore } from "../../stores/debugLogStore";

export function DebugLogPanel() {
  const entries = useDebugLogStore((state) => state.entries);
  const clearLogs = useDebugLogStore((state) => state.clearLogs);

  return (
    <section className="debugLogPanel">
      <div className="settingsRow">
        <div>
          <h3>Logs</h3>
          <p>In-memory app events for auth, video, HID, and voice.</p>
        </div>
        <button type="button" onClick={clearLogs}>Clear</button>
      </div>
      <div className="logList">
        {entries.length ? (
          entries.map((entry) => (
            <article className={`logEntry ${entry.level}`} key={entry.id}>
              <span>{entry.time}</span>
              <strong>{entry.area}</strong>
              <p>{entry.message}</p>
            </article>
          ))
        ) : (
          <p className="emptyState">No logs yet.</p>
        )}
      </div>
    </section>
  );
}
