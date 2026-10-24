import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Fingerprint,
  Link2,
  Loader2,
  LockKeyhole,
  Radio,
  ShieldCheck,
  X,
} from "lucide-react";
import { GatewayClient } from "../lib/gatewayClient";
import { getBiometricStatus, nativeAvailable } from "../lib/native";
import { Badge, PanelTitle } from "./ui";

export function SettingsPanel({
  connection,
  setConnection,
  setPing,
  gateway,
  onNative,
  onNotice,
}: {
  connection: string;
  setConnection: (state: "connecting" | "connected" | "offline") => void;
  setPing: (ping: number | null) => void;
  gateway: { current: GatewayClient | null };
  onNative: () => void;
  onNotice: (message: string) => void;
}) {
  const [url, setUrl] = useState("wss://");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [biometric, setBiometric] = useState(false);
  const operation = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void getBiometricStatus().then((status) => {
      if (!cancelled) setBiometric(status.available && status.enrolled);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(
    () => () => {
      operation.current++;
      if (pending.current) {
        void gateway.current?.close();
        setConnection("offline");
      }
    },
    [],
  );
  const connect = async () => {
    setError("");
    if (!nativeAvailable()) {
      setError(
        "Gateway connections require Warren’s Tauri transport. Open the installed app, then configure your endpoint here or in the secure workspace.",
      );
      return;
    }
    const current = ++operation.current;
    setConnection("connecting");
    pending.current = true;
    await gateway.current?.close();
    if (current !== operation.current) return;
    const client: GatewayClient = new GatewayClient(
      {
        id: "mission-control",
        name: "Mission Control",
        url,
        token,
        model: "",
        transport: "gateway",
      },
      undefined,
      () => {
        if (gateway.current === client) {
          setConnection("offline");
          setPing(null);
        }
      },
    );
    gateway.current = client;
    try {
      await client.connect();
      const ms = await client.ping();
      if (current !== operation.current) {
        await client.close();
        return;
      }
      setPing(ms);
      setConnection("connected");
      setToken("");
      onNotice("Gateway connected. durable-admission-v1 verified.");
    } catch (cause) {
      await client.close();
      if (current === operation.current) {
        setConnection("offline");
        setPing(null);
        setError(
          cause instanceof Error ? cause.message : "Gateway connection failed.",
        );
      }
    } finally {
      pending.current = false;
    }
  };
  return (
    <div className="mc-settings-grid">
      <section className="mc-panel mc-settings-card">
        <PanelTitle
          icon={<Radio size={16} />}
          title="WebSocket gateway"
          extra={
            <Badge tone={connection === "connected" ? "teal" : "neutral"}>
              {connection.toUpperCase()}
            </Badge>
          }
        />
        <div className="mc-settings-inner">
          <h3>The connection to your swarm.</h3>
          <p>
            Hermes canonical Gateway with session authority and durable
            admission. Live connection status is measured from the native
            transport.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void connect();
            }}
          >
            <label>
              Gateway endpoint
              <input
                type="url"
                required
                placeholder="wss://your-vps:3450/api/ws"
                value={url}
                disabled={
                  connection === "connected" || connection === "connecting"
                }
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
            <label>
              Session token <span>MEMORY ONLY</span>
              <input
                type="password"
                autoComplete="off"
                required={connection !== "connected"}
                placeholder="Enter your gateway session token"
                value={token}
                disabled={
                  connection === "connected" || connection === "connecting"
                }
                onChange={(event) => setToken(event.target.value)}
              />
            </label>
            {error && (
              <p className="mc-form-error" role="alert">
                {error}
              </p>
            )}
            <div className="mc-gateway-actions">
              {connection === "connected" ? (
                <button
                  className="mc-button secondary"
                  type="button"
                  onClick={async () => {
                    operation.current++;
                    await gateway.current?.close();
                    gateway.current = null;
                    setConnection("offline");
                    setPing(null);
                  }}
                >
                  Disconnect gateway <X size={14} />
                </button>
              ) : (
                <button
                  type="submit"
                  className="mc-button primary"
                  disabled={connection === "connecting"}
                >
                  {connection === "connecting" ? (
                    <Loader2 size={15} className="mc-spin" />
                  ) : (
                    <Link2 size={15} />
                  )}{" "}
                  {connection === "connecting"
                    ? "Connecting…"
                    : "Connect gateway"}
                </button>
              )}
            </div>
          </form>
          <div className="mc-settings-foot">
            <ShieldCheck size={13} /> No tokens are written to browser storage.
          </div>
          <p className="mc-adapter-note">
            Connect a Gateway to receive session data. Mission, agent, and
            device information will remain empty until the connected service
            supplies it. Manage SSH and agent profiles in the secure workspace.
          </p>
        </div>
      </section>
      <div className="mc-settings-stack">
        <section className="mc-panel mc-settings-card">
          <PanelTitle
            icon={<LockKeyhole size={16} />}
            title="Local encrypted vault"
            extra={<ShieldCheck size={15} className="mc-teal" />}
          />
          <div className="mc-settings-inner">
            <div className="mc-security-symbol">
              <ShieldCheck size={27} />
            </div>
            <h3>Your credentials stay yours.</h3>
            <p>
              Manage SSH keys, Gateway tokens, and conversation history in the
              existing Stronghold vault on your device.
            </p>
            <button className="mc-button secondary" onClick={onNative}>
              Open secure workspace <ArrowUpRight size={14} />
            </button>
            <div className="mc-settings-foot">
              {nativeAvailable()
                ? "Native vault available"
                : "Encrypted vault requires the installed Tauri app"}
            </div>
          </div>
        </section>
        <section className="mc-panel mc-settings-card">
          <PanelTitle
            icon={<Fingerprint size={17} />}
            title="Biometric unlock"
          />
          <div className="mc-settings-inner">
            <div className="mc-biometric-row">
              <span>
                <strong>Use your fingerprint</strong>
                <p>
                  {biometric
                    ? "Sensor detected. Manage enrollment in the secure vault."
                    : "Requires an enrolled sensor in the native app."}
                </p>
              </span>
              <Fingerprint size={28} />
            </div>
            <button className="mc-button secondary" onClick={onNative}>
              Manage device security <ArrowUpRight size={14} />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
