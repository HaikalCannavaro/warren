import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { parseToolArtifact, sanitizeArtifacts } from "./artifacts";
import { ArtifactPreview } from "../mission-control/ArtifactPreview";
import { sanitizeCockpitConfig } from "./cockpitConfig";
const data =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
afterEach(cleanup);
it("accepts provided image data and rejects URLs, SVG, bad headers and excessive payloads", () => {
  expect(
    parseToolArtifact({
      tool: "browser_exec",
      artifact_type: "image/png",
      data,
    }),
  ).toMatchObject({ tool: "browser_exec", data, type: "image/png" });
  for (const item of [
    {
      artifact_type: "image/png",
      data: "https://private.example/snapshot.png",
    },
    {
      artifact_type: "image/svg+xml",
      data: "data:image/svg+xml;base64,PHN2Zz4=",
    },
    { artifact_type: "image/png", data: "data:image/png;base64,PHNjcmlwdD4=" },
    { artifact_type: "image/png", data: data + "A".repeat(2 * 1024 * 1024) },
  ])
    expect(parseToolArtifact(item)).toBeUndefined();
});
it("recovers bounded captures and supports zoom without external network image URLs", () => {
  const artifact = parseToolArtifact({
    tool: "browser_exec",
    artifact_type: "image/png",
    data,
  })!;
  expect(sanitizeArtifacts([artifact, artifact, artifact])).toHaveLength(2);
  render(<ArtifactPreview artifact={artifact} />);
  expect(screen.getByRole("img").getAttribute("src")).toBe(data);
  fireEvent.click(
    screen.getByRole("button", { name: "Zoom browser snapshot" }),
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getAllByRole("img")).toHaveLength(2);
});
it("sanitizes restored endpoint settings and never lets an invalid poll interval cause a tight loop", () => {
  expect(
    sanitizeCockpitConfig({
      enabled: true,
      pollInterval: "bad",
      kanbanUrl: 42,
    }),
  ).toMatchObject({ enabled: true, pollInterval: 10000, kanbanUrl: "" });
  expect(
    sanitizeCockpitConfig({ enabled: true, pollInterval: 0 })?.pollInterval,
  ).toBe(5000);
  expect(sanitizeCockpitConfig(undefined)).toBeUndefined();
});
