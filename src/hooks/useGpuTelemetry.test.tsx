import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { VpsProfile } from "../types";
import { useGpuTelemetry } from "./useGpuTelemetry";
const native = vi.hoisted(() => ({ query: vi.fn(), disconnect: vi.fn() }));
vi.mock("../lib/native", () => ({
  nativeAvailable: () => true,
  queryGpuSnapshot: native.query,
  disconnectSsh: native.disconnect,
}));
const profile: VpsProfile = {
  id: "pc",
  name: "haikalcannavaro",
  host: "100.91.205.20",
  port: 22,
  username: "operator",
  auth: "password",
  password: "test-only",
  privateKey: "",
  passphrase: "",
  fingerprint: "SHA256:verified",
};
beforeEach(() => {
  vi.useFakeTimers();
  native.query.mockReset().mockResolvedValue("14,8,8192,655,48");
  native.disconnect.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("does not authenticate to an unverified host", async () => {
  const h = renderHook(() =>
    useGpuTelemetry({ ...profile, fingerprint: undefined }, true),
  );
  await act(async () => {});
  expect(native.query).not.toHaveBeenCalled();
  expect(h.result.current.error).toContain("fingerprint");
});
it("uses a separate fixed-command query and parses fresh readings", async () => {
  const h = renderHook(() => useGpuTelemetry(profile, true));
  await act(async () => {});
  expect(native.query).toHaveBeenCalledTimes(1);
  expect(native.query.mock.calls[0][0]).toMatchObject({
    host: "100.91.205.20",
    username: "operator",
    fingerprint: "SHA256:verified",
  });
  expect(native.query.mock.calls[0][0].sessionId).toMatch(/^gpu:/);
  expect(h.result.current.gpus[0]).toMatchObject({
    gpuUsage: 14,
    temperature: 48,
  });
});
it("cancels an in-flight background query when sampling stops", async () => {
  let finish!: (text: string) => void;
  native.query.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const h = renderHook(({ enabled }) => useGpuTelemetry(profile, enabled), {
    initialProps: { enabled: true },
  });
  await act(async () => {});
  const id = native.query.mock.calls[0][0].sessionId;
  h.rerender({ enabled: false });
  expect(native.disconnect).toHaveBeenCalledWith(id);
  await act(async () => finish("99,99,8192,8192,70"));
  expect(h.result.current.gpus).toEqual([]);
});
