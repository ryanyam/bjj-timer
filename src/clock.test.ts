import { describe, expect, it } from "vitest";
import { formatClock } from "./clock";

describe("formatClock", () => {
  it("formats the local date and a 12-hour time with hour and minutes", () => {
    const morning = new Date(2026, 10, 3, 10, 44, 45);

    expect(formatClock(morning, "en-US")).toEqual({
      date: "Tue, Nov 3",
      time: "10:44",
      period: "AM",
    });
  });

  it("uses a compact PM indicator in the afternoon", () => {
    const afternoon = new Date(2026, 10, 3, 15, 5, 9);

    expect(formatClock(afternoon, "en-US")).toEqual({
      date: "Tue, Nov 3",
      time: "3:05",
      period: "PM",
    });
  });

  it("shows midnight as 12 AM", () => {
    const midnight = new Date(2026, 10, 3, 0, 0, 0);

    expect(formatClock(midnight, "en-US")).toEqual({
      date: "Tue, Nov 3",
      time: "12:00",
      period: "AM",
    });
  });
});
