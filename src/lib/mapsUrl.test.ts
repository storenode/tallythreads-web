import { describe, expect, it } from "vitest";
import { legMapUrl } from "./mapsUrl";

describe("legMapUrl", () => {
  it("builds a keyless Google Maps directions URL", () => {
    const url = legMapUrl("Kadapa", "Surat", "driving")!;
    expect(url).toContain("https://www.google.com/maps/dir/?");
    expect(url).toContain("api=1");
    expect(url).toContain("origin=Kadapa");
    expect(url).toContain("destination=Surat");
    expect(url).toContain("travelmode=driving");
    expect(url).not.toContain("key="); // free scheme, no API key
  });

  it("url-encodes places with spaces and commas", () => {
    const url = legMapUrl("Kadapa, AP", "Surat, Gujarat", "transit")!;
    expect(url).toContain("origin=Kadapa%2C+AP");
    expect(url).toContain("destination=Surat%2C+Gujarat");
    expect(url).toContain("travelmode=transit");
  });

  it("returns null when either endpoint is blank", () => {
    expect(legMapUrl("", "Surat")).toBeNull();
    expect(legMapUrl("Kadapa", "  ")).toBeNull();
  });

  it("defaults to driving", () => {
    expect(legMapUrl("A", "B")).toContain("travelmode=driving");
  });
});
