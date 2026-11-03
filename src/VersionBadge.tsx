import { versionLabel } from "./version";

/** Discreet build identifier for the non-public settings/diagnostics panel. */
export function VersionBadge() {
  return (
    <p className="settings-panel__version" aria-label="Application version">
      {versionLabel()}
    </p>
  );
}
