import { useEffect, useState } from "react";
import {
  GET_READY_OPTIONS,
  getReadySecondsForMode,
  setGetReadySecondsForMode,
  type GetReadySeconds,
} from "./settings";
import { TRAINING_MODES } from "./training";
import { VersionBadge } from "./VersionBadge";

type Values = Record<string, GetReadySeconds>;

function readValues(): Values {
  return Object.fromEntries(
    TRAINING_MODES.map((mode) => [mode.id, getReadySecondsForMode(mode.id)]),
  );
}

/**
 * Non-public settings surface. It is only reachable by opening the app with
 * `#settings`; there is no visible link from the training screen.
 */
export function SettingsPanel() {
  const [open, setOpen] = useState(
    () => typeof window !== "undefined" && window.location.hash === "#settings",
  );
  const [values, setValues] = useState<Values>(readValues);

  useEffect(() => {
    const sync = () => {
      setOpen(window.location.hash === "#settings");
      setValues(readValues());
    };

    window.addEventListener("hashchange", sync);

    return () => window.removeEventListener("hashchange", sync);
  }, []);

  if (!open) {
    return null;
  }

  return (
    <aside className="settings-panel" aria-label="Timer settings">
      <h2 className="settings-panel__title">Timer settings</h2>
      <VersionBadge />
      <p className="settings-panel__intro">Get Ready countdown</p>

      {TRAINING_MODES.map((mode) => (
        <label key={mode.id} className="settings-panel__row">
          <span>{mode.title}</span>
          <select
            value={values[mode.id] ?? 0}
            onChange={(event) => {
              const seconds = Number(event.target.value) as GetReadySeconds;
              setGetReadySecondsForMode(mode.id, seconds);
              setValues((current) => ({ ...current, [mode.id]: seconds }));
            }}
          >
            {GET_READY_OPTIONS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds === 0 ? "Off (0 s)" : `${seconds} s`}
              </option>
            ))}
          </select>
        </label>
      ))}
    </aside>
  );
}
