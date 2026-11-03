import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveClock } from "./LiveClock";

function clockTime(container: HTMLElement): string {
  return container.querySelector(".app-clock__time")?.textContent?.trim() ?? "";
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 3, 10, 44, 45));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LiveClock", () => {
  it("shows the local date and advances the displayed minute", () => {
    const { container } = render(<LiveClock locale="en-US" />);

    expect(
      container.querySelector(".app-clock__date")?.textContent?.trim(),
    ).toBe("Tue, Nov 3");
    expect(clockTime(container)).toBe("10:44");
    expect(
      container.querySelector(".app-clock__period")?.textContent?.trim(),
    ).toBe("AM");

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(clockTime(container)).toBe("10:45");
  });

  it("clears its own interval on unmount", () => {
    const { unmount } = render(<LiveClock locale="en-US" />);

    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
