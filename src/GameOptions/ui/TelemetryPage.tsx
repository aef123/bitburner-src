import React, { useState } from "react";
import { Button, MenuItem, Select, SelectChangeEvent, TextField, Typography } from "@mui/material";
import { GameOptionsPage } from "./GameOptionsPage";
import { Settings } from "../../Settings/Settings";
import { OtelLogLevel } from "../../Settings/SettingEnums";
import { isValidOtlpEndpoint } from "../../Settings/SettingsUtils";
import { OptionSwitch } from "../../ui/React/OptionSwitch";
import { OptionsSlider } from "./OptionsSlider";
import { reconfigureTelemetry } from "../../Telemetry";
import { SnackbarEvents } from "../../ui/React/Snackbar";
import { ToastVariant } from "@enums";

function isLocalEndpoint(endpoint: string): boolean {
  try {
    const host = new URL(endpoint).hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      host.startsWith("172.")
    );
  } catch {
    return false;
  }
}

export const TelemetryPage = (): React.ReactElement => {
  const [enabled, setEnabled] = useState(Settings.TelemetryEnabled);
  const [logLevel, setLogLevel] = useState(Settings.TelemetryLogLevel);
  const [sinkGameConsole, setSinkGameConsole] = useState(Settings.TelemetrySinkGameConsole);
  const [sinkStdio, setSinkStdio] = useState(Settings.TelemetrySinkStdio);
  const [sinkOtlp, setSinkOtlp] = useState(Settings.TelemetrySinkOtlp);
  const [endpoint, setEndpoint] = useState(Settings.TelemetryOtlpEndpoint);
  const [endpointError, setEndpointError] = useState(isValidOtlpEndpoint(Settings.TelemetryOtlpEndpoint).message ?? "");
  const [metricsEnabled, setMetricsEnabled] = useState(Settings.TelemetryMetricsEnabled);
  const [tracesEnabled, setTracesEnabled] = useState(Settings.TelemetryTracesEnabled);
  const [intervalSec, setIntervalSec] = useState((Settings.TelemetryExportIntervalMs / 1000).toString());
  const [intervalError, setIntervalError] = useState("");

  /** Apply the new configuration to the live telemetry pipeline. */
  function reconfigure(): void {
    void reconfigureTelemetry();
  }

  function handleLogLevelChange(event: SelectChangeEvent<OtelLogLevel>): void {
    const value = event.target.value as OtelLogLevel;
    setLogLevel(value);
    Settings.TelemetryLogLevel = value;
    reconfigure();
  }

  function handleEndpointChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const newValue = event.target.value.trim();
    setEndpoint(newValue);
    const result = isValidOtlpEndpoint(newValue);
    if (!result.success) {
      setEndpointError(result.message);
      return;
    }
    setEndpointError("");
    Settings.TelemetryOtlpEndpoint = newValue;
    reconfigure();
  }

  function handleIntervalChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const newValue = event.target.value.trim();
    setIntervalSec(newValue);
    const seconds = Number(newValue);
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 600) {
      setIntervalError("Interval must be between 1 and 600 seconds");
      return;
    }
    setIntervalError("");
    Settings.TelemetryExportIntervalMs = Math.round(seconds * 1000);
    reconfigure();
  }

  async function testConnection(): Promise<void> {
    const url = `${endpoint.replace(/\/+$/, "")}/v1/logs`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceLogs: [] }),
      });
      if (response.ok) {
        SnackbarEvents.emit(`Telemetry endpoint reachable (HTTP ${response.status}).`, ToastVariant.SUCCESS, 4000);
      } else {
        SnackbarEvents.emit(`Endpoint responded with HTTP ${response.status}.`, ToastVariant.WARNING, 5000);
      }
    } catch (error: unknown) {
      SnackbarEvents.emit(
        `Could not reach endpoint (network/CORS error). ${String(error)}`,
        ToastVariant.ERROR,
        6000,
      );
    }
  }

  const isValidEndpoint = endpointError === "";
  const showExternalWarning = sinkOtlp && isValidEndpoint && !isLocalEndpoint(endpoint);

  return (
    <GameOptionsPage title="Telemetry">
      <Typography>
        OpenTelemetry support. When enabled, the game emits structured logs, periodic metrics (money, skills, running
        scripts, etc.), and traces of the script execution chain. Your scripts can also emit logs via{" "}
        <code>ns.telemetry.debug/info/warn/error</code>. Data leaves the game only through the OTLP sink, to the endpoint
        you configure below; nothing is sent anywhere else.
      </Typography>

      <OptionSwitch
        checked={enabled}
        onChange={(value) => {
          setEnabled(value);
          Settings.TelemetryEnabled = value;
          reconfigure();
        }}
        text="Enable telemetry"
        tooltip={<>Master switch. When off, no telemetry is emitted and the OpenTelemetry SDK is never loaded.</>}
      />

      <Typography variant="h6" sx={{ mt: 1 }}>
        Log level
      </Typography>
      <Select value={logLevel} onChange={handleLogLevelChange} disabled={!enabled}>
        {Object.values(OtelLogLevel).map((level) => (
          <MenuItem key={level} value={level}>
            {level}
          </MenuItem>
        ))}
      </Select>

      <Typography variant="h6" sx={{ mt: 1 }}>
        Sinks (any combination)
      </Typography>
      <OptionSwitch
        checked={sinkGameConsole}
        disabled={!enabled}
        onChange={(value) => {
          setSinkGameConsole(value);
          Settings.TelemetrySinkGameConsole = value;
          reconfigure();
        }}
        text="In-game console"
        tooltip={<>Route log records to the in-game terminal / script tail logs (like ns.print). Logs only.</>}
      />
      <OptionSwitch
        checked={sinkStdio}
        disabled={!enabled}
        onChange={(value) => {
          setSinkStdio(value);
          Settings.TelemetrySinkStdio = value;
          reconfigure();
        }}
        text="Stdout / stderr"
        tooltip={<>Write to the JS console (developer tools): errors to console.error, everything else to console.log.</>}
      />
      <OptionSwitch
        checked={sinkOtlp}
        disabled={!enabled}
        onChange={(value) => {
          setSinkOtlp(value);
          Settings.TelemetrySinkOtlp = value;
          reconfigure();
        }}
        text="OTLP endpoint"
        tooltip={<>Export logs, metrics, and traces to an OpenTelemetry collector over OTLP/HTTP.</>}
      />

      {sinkOtlp && (
        <>
          <TextField
            error={!isValidEndpoint}
            InputProps={{ startAdornment: <Typography style={{ minWidth: "120px" }}>OTLP endpoint:&nbsp;</Typography> }}
            value={endpoint}
            onChange={handleEndpointChange}
            placeholder="http://localhost:4318"
            size="medium"
            disabled={!enabled}
          />
          {endpointError && <Typography color={Settings.theme.error}>{endpointError}</Typography>}
          <Typography variant="caption">
            Base URL only; the game appends /v1/logs, /v1/metrics, and /v1/traces. Your collector must allow this
            browser origin (CORS).
          </Typography>
          {showExternalWarning && (
            <Typography color={Settings.theme.warning}>
              This looks like a non-local endpoint — your game data will be sent to an external server.
            </Typography>
          )}
          <Button
            disabled={!enabled || !isValidEndpoint}
            onClick={() => {
              testConnection().catch((error) => console.error(error));
            }}
          >
            Test connection
          </Button>
        </>
      )}

      <Typography variant="h6" sx={{ mt: 1 }}>
        Signals
      </Typography>
      <OptionSwitch
        checked={metricsEnabled}
        disabled={!enabled}
        onChange={(value) => {
          setMetricsEnabled(value);
          Settings.TelemetryMetricsEnabled = value;
          reconfigure();
        }}
        text="Export game metrics"
        tooltip={<>Periodically export player money, skills, karma, HP, running-script count, RAM, and faction rep.</>}
      />
      <OptionSwitch
        checked={tracesEnabled}
        disabled={!enabled}
        onChange={(value) => {
          setTracesEnabled(value);
          Settings.TelemetryTracesEnabled = value;
          reconfigure();
        }}
        text="Trace script execution chain"
        tooltip={<>Emit one span per script, linking each script to the script that launched it (run/exec/spawn).</>}
      />
      {tracesEnabled && (
        <OptionsSlider
          label="Trace sample rate (%)"
          initialValue={Math.round(Settings.TelemetryTraceSampleRatio * 100)}
          callback={(_event, newValue) => {
            const ratio = (typeof newValue === "number" ? newValue : newValue[0]) / 100;
            Settings.TelemetryTraceSampleRatio = ratio;
            reconfigure();
          }}
          step={5}
          min={0}
          max={100}
          tooltip={<>Sampling is decided at the root script and inherited by children. 100% can be heavy for large fleets.</>}
        />
      )}

      <Typography variant="h6" sx={{ mt: 1 }}>
        Export interval
      </Typography>
      <TextField
        error={intervalError !== ""}
        InputProps={{ startAdornment: <Typography style={{ minWidth: "120px" }}>Interval (s):&nbsp;</Typography> }}
        value={intervalSec}
        onChange={handleIntervalChange}
        placeholder="10"
        size="medium"
        disabled={!enabled}
      />
      {intervalError && <Typography color={Settings.theme.error}>{intervalError}</Typography>}
    </GameOptionsPage>
  );
};
