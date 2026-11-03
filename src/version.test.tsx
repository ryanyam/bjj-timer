import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsPanel } from "./SettingsPanel";
import { VersionBadge } from "./VersionBadge";
import { APP_VERSION, versionLabel } from "./version";

const packageVersion = (
  JSON.parse(
    readFileSync("package.json", "utf8"),
  ) as { version: string }
).version;

afterEach(() => {
  window.location.hash = "";
});

describe("application version", () => {
  it("reads the authoritative package.json version", () => {
    expect(APP_VERSION).toBe(packageVersion);
  });

  it("uses a valid SemVer version", () => {
    expect(packageVersion).toMatch(
      /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
    );
  });

  it("derives the display label from the shared utility", () => {
    expect(versionLabel()).toBe(`BJJ Timer · v${packageVersion}`);
  });

  it("renders the version badge", () => {
    render(<VersionBadge />);

    expect(screen.getByLabelText("Application version").textContent).toBe(
      versionLabel(),
    );
  });

  it("shows the version in the non-public settings panel", () => {
    window.location.hash = "#settings";
    render(<SettingsPanel />);

    expect(screen.getByLabelText("Application version").textContent).toBe(
      versionLabel(),
    );
  });
});
