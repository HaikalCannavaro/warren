import { useEffect, useState } from "react";
import type { VpsProfile } from "../types";
import {
  disconnectSsh,
  nativeAvailable,
  queryGpuSnapshot,
} from "../lib/native";
import { parseGpuCsv, type GpuSnapshot } from "../lib/cockpit";
export function useGpuTelemetry(
  profile: VpsProfile | undefined,
  enabled: boolean,
) {
  const [state, setState] = useState<{
    gpus: GpuSnapshot[];
    error: string;
    updatedAt: number | null;
    loading: boolean;
  }>({ gpus: [], error: "", updatedAt: null, loading: false });
  useEffect(() => {
    setState({ gpus: [], error: "", updatedAt: null, loading: false });
    if (!enabled || !profile) return;
    if (!nativeAvailable()) {
      setState((old) => ({
        ...old,
        error: "GPU queries require the installed app.",
      }));
      return;
    }
    if (!profile.fingerprint) {
      setState((old) => ({
        ...old,
        error:
          "Connect SSH and verify this host fingerprint before querying GPU telemetry.",
      }));
      return;
    }
    let disposed = false,
      running = false,
      queryId: string | null = null;
    const poll = async () => {
      if (disposed || running) return;
      running = true;
      queryId = `gpu:${crypto.randomUUID()}`;
      setState((old) => ({ ...old, loading: true }));
      try {
        const text = await queryGpuSnapshot({
          sessionId: queryId,
          host: profile.host,
          port: profile.port,
          username: profile.username,
          auth: profile.auth,
          password: profile.password,
          privateKey: profile.privateKey,
          passphrase: profile.passphrase,
          fingerprint: profile.fingerprint!,
          cols: 80,
          rows: 24,
        });
        const gpus = parseGpuCsv(text);
        if (!disposed)
          setState({ gpus, error: "", updatedAt: Date.now(), loading: false });
      } catch {
        if (!disposed)
          setState((old) => ({
            ...old,
            error:
              "GPU query failed. Check the SSH connection, NVIDIA driver, and nvidia-smi availability.",
            loading: false,
          }));
      } finally {
        running = false;
        queryId = null;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 10000);
    return () => {
      disposed = true;
      clearInterval(timer);
      if (queryId) void disconnectSsh(queryId).catch(() => {});
    };
  }, [
    profile?.id,
    profile?.host,
    profile?.port,
    profile?.username,
    profile?.auth,
    profile?.password,
    profile?.privateKey,
    profile?.passphrase,
    profile?.fingerprint,
    enabled,
  ]);
  return state;
}
