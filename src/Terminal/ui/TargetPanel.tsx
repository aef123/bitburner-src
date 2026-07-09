import React from "react";
import { format } from "date-fns";
import { type Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { Player } from "@player";
import { Server } from "../../Server/Server";
import { Settings } from "../../Settings/Settings";
import { Terminal } from "../../Terminal";
import { getServerSnapshot, type ServerSnapshot } from "../serverSnapshots";
import { reRunCommand } from "./reRunCommand";
import { formatMoney, formatRam, formatSecurity } from "../../ui/formatNumber";

const useStyles = makeStyles()((theme: Theme) => ({
  // Panel geometry per 2A notes: 280px right column, left hairline, own scroll.
  // Mock panel bg #0a0e13 has no token; bgApp (#0a0d12) is the nearest (same call as the history panel).
  panel: {
    width: "280px",
    flex: "none",
    boxSizing: "border-box",
    borderLeft: `1px solid ${theme.colors.borderDefault as string}`,
    backgroundColor: theme.colors.bgApp,
    padding: "18px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    overflowY: "auto",
    minHeight: 0,
  },
  sectionLabel: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: "9.5px",
    fontWeight: 600,
    color: theme.colors.textTertiary,
    letterSpacing: ".16em",
    marginBottom: "8px",
  },
  hostname: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: "15px",
    fontWeight: 700,
    color: theme.colors.accentCyan,
    overflowWrap: "anywhere",
  },
  // Data-source stamp per 2A notes: sans, dim base with the "analyze · HH:MM" part brighter.
  // Mock #7d8fa1 = textSecondary; the #9fb1c1 highlight has no token, textBody is the nearest step up.
  stamp: {
    fontFamily: Settings.styles.fontFamily,
    fontSize: "10.5px",
    color: theme.colors.textSecondary,
    marginTop: "2px",
  },
  stampSource: {
    color: theme.colors.textBody,
  },
  // Cards per 2A notes: bg #0c1117 = bgPanelDeep, border #1a232e = borderDefault, radius 10.
  card: {
    backgroundColor: theme.colors.bgPanelDeep,
    border: `1px solid ${theme.colors.borderDefault as string}`,
    borderRadius: "10px",
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  statLabelRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: "8px",
    fontFamily: Settings.styles.fontFamily,
    fontSize: "10.5px",
    marginBottom: "4px",
  },
  statLabel: {
    color: theme.colors.textSecondary,
    flexShrink: 0,
  },
  statValue: {
    fontFamily: Settings.styles.monoFontFamily,
    color: theme.colors.textBody,
    textAlign: "right",
    overflowWrap: "anywhere",
  },
  moneyValue: {
    color: theme.colors.accentGold,
  },
  securityValue: {
    color: theme.colors.accentRed,
  },
  securityMin: {
    color: theme.colors.textTertiary,
  },
  accessGranted: {
    color: theme.colors.accentGreen,
  },
  accessDenied: {
    color: theme.colors.accentRed,
  },
  barTrack: {
    height: "5px",
    borderRadius: "3px",
    backgroundColor: theme.colors.track,
    overflow: "hidden",
  },
  barFillMoney: {
    height: "100%",
    backgroundColor: theme.colors.accentGold,
  },
  barFillSecurity: {
    height: "100%",
    backgroundColor: theme.colors.accentRed,
  },
  undiscoveredHeader: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: "9.5px",
    fontWeight: 600,
    color: theme.colors.textTertiary,
    letterSpacing: ".16em",
  },
  undiscoveredBody: {
    fontFamily: Settings.styles.fontFamily,
    fontSize: "10.5px",
    lineHeight: 1.6,
    color: theme.colors.textTertiary,
    margin: 0,
  },
  undiscoveredHost: {
    fontFamily: Settings.styles.monoFontFamily,
    color: theme.colors.textSecondary,
  },
  undiscoveredCommand: {
    fontFamily: Settings.styles.monoFontFamily,
    color: theme.colors.accentCyan,
  },
  actionsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
  },
  actionButton: {
    height: "34px",
    borderRadius: "8px",
    fontFamily: Settings.styles.fontFamily,
    fontSize: "11.5px",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "border-color 120ms ease-out",
    "&:disabled": {
      cursor: "default",
      opacity: 0.4,
    },
  },
  // Primary button per 2A mock: cyan fill, dark text. Mock text #06131a has no token; bgApp is
  // the nearest dark.
  actionPrimary: {
    border: "none",
    backgroundColor: theme.colors.accentCyan,
    color: theme.colors.bgApp,
  },
  // Ghost buttons per 2A mock / Stage 1 pattern: border #22303e = borderCard, hover → borderFocus.
  actionGhost: {
    border: `1px solid ${theme.colors.borderCard as string}`,
    backgroundColor: "transparent",
    color: theme.colors.textSecondary,
    "&:hover:enabled": {
      borderColor: theme.colors.borderFocus,
    },
  },
}));

interface QuickActionProps {
  command: "hack" | "weaken" | "grow" | "backdoor";
  primary?: boolean;
  disabled: boolean;
}

function QuickActionButton({ command, primary, disabled }: QuickActionProps): React.ReactElement {
  const { classes, cx } = useStyles();
  return (
    <button
      className={cx(classes.actionButton, primary ? classes.actionPrimary : classes.actionGhost)}
      data-target-action={command}
      disabled={disabled}
      onClick={() => reRunCommand(command)}
    >
      {command}
    </button>
  );
}

function StatBars({ snapshot }: { snapshot: ServerSnapshot }): React.ReactElement {
  const { classes, cx } = useStyles();
  // Guard division: purchased/zero-money servers have moneyMax 0.
  const moneyFraction = snapshot.moneyMax > 0 ? Math.min(snapshot.moneyAvailable / snapshot.moneyMax, 1) : 0;
  // Security has no natural "max" besides the hard cap of 100 (Server.capDifficulty), so the bar
  // renders current difficulty against that cap; the value row shows current vs min explicitly.
  const securityFraction = Math.min(Math.max(snapshot.hackDifficulty, 0) / 100, 1);
  return (
    <div className={classes.card} data-target-stats>
      <div>
        <div className={classes.statLabelRow}>
          <span className={classes.statLabel}>Money</span>
          <span className={cx(classes.statValue, classes.moneyValue)} data-target-money>
            {formatMoney(snapshot.moneyAvailable, true)} / {formatMoney(snapshot.moneyMax, true)}
          </span>
        </div>
        <div className={classes.barTrack}>
          <div className={classes.barFillMoney} style={{ width: `${moneyFraction * 100}%` }} />
        </div>
      </div>
      <div>
        <div className={classes.statLabelRow}>
          <span className={classes.statLabel}>Security</span>
          <span className={classes.statValue} data-target-security>
            <span className={classes.securityValue}>{formatSecurity(snapshot.hackDifficulty)}</span>
            <span className={classes.securityMin}> / min {formatSecurity(snapshot.minDifficulty)}</span>
          </span>
        </div>
        <div className={classes.barTrack}>
          <div className={classes.barFillSecurity} style={{ width: `${securityFraction * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

/**
 * Right-hand target panel (Task 9, 2A part 2) for the server the terminal is connected to.
 *
 * Honesty rule: this panel may only show what the game already shows for free, plus whatever the
 * player's own analyze/scan-analyze runs revealed (via serverSnapshots, rendered frozen with a
 * data-source stamp). It NEVER reads money/security off the live Server object.
 *
 * Rerenders arrive from TerminalRoot's 25ms-debounced TerminalEvents subscription (this component
 * is deliberately not memoized): analyze completion prints output (→ emit), and connect calls
 * setcwd (→ emit), so both refresh paths are already covered.
 */
export function TargetPanel(): React.ReactElement {
  const { classes, cx } = useStyles();
  const server = Player.getCurrentServer();
  // Hacknet servers (and other BaseServer subclasses) can be connected to but have no
  // money/security stats at all — for those, only the always-known facts below render.
  const isServer = server instanceof Server;
  const snapshot = isServer ? getServerSnapshot(server.hostname) : undefined;

  const actionActive = Terminal.action !== null;
  // Quick actions add zero capability — they submit the same terminal command a player would
  // type — so anything the command itself would refuse is disabled up front:
  // no admin rights / not a normal Server / player-owned machine (hack.ts:22-38, backdoor.ts:20-33).
  const baseDisabled = actionActive || !isServer || !server.hasAdminRights || server.purchasedByPlayer;
  const backdoorDisabled = baseDisabled || (isServer && server.backdoorInstalled);

  return (
    <div className={classes.panel} data-target-panel>
      <div>
        <div className={classes.sectionLabel}>CONNECTED TO</div>
        <div className={classes.hostname} data-target-hostname>
          {server.hostname}
        </div>
        {snapshot !== undefined && (
          <div className={classes.stamp} data-target-stamp>
            as of <span className={classes.stampSource}>analyze · {format(new Date(snapshot.timestamp), "HH:mm")}</span>{" "}
            — run again to refresh
          </div>
        )}
      </div>

      {/* Always-known facts — each one is freely visible in-game without analyze:
          - admin rights: `scan-analyze` prints "Root Access" for every listed server
            (scananalyze.ts:90-97) and `sudov` prints it on demand;
          - backdoor status: the result of the player's own `backdoor` action, and the game exposes
            it freely by letting `connect` jump directly to backdoored servers (connect.ts:43);
          - RAM used/max: the `free` command prints both with no cost or delay (free.ts). */}
      <div className={classes.card} data-target-facts>
        <div className={classes.statLabelRow}>
          <span className={classes.statLabel}>Access</span>
          <span
            className={cx(classes.statValue, server.hasAdminRights ? classes.accessGranted : classes.accessDenied)}
            data-target-access
          >
            {server.hasAdminRights ? "root" : "no root"}
          </span>
        </div>
        {isServer && (
          <div className={classes.statLabelRow}>
            <span className={classes.statLabel}>Backdoor</span>
            <span className={classes.statValue} data-target-backdoor>
              {server.backdoorInstalled ? "installed" : "none"}
            </span>
          </div>
        )}
        <div className={classes.statLabelRow}>
          <span className={classes.statLabel}>RAM</span>
          <span className={classes.statValue} data-target-ram>
            {formatRam(server.ramUsed)} / {formatRam(server.maxRam)}
          </span>
        </div>
      </div>

      {snapshot !== undefined && <StatBars snapshot={snapshot} />}

      {/* No snapshot for a normal server → say what's unknown and how to reveal it. Non-Server
          hosts don't get this card: they have no hidden stats for analyze to reveal. */}
      {isServer && snapshot === undefined && (
        <div className={classes.card} data-target-undiscovered>
          <div className={classes.undiscoveredHeader}>UNDISCOVERED</div>
          <p className={classes.undiscoveredBody}>
            Money and security unknown for <span className={classes.undiscoveredHost}>{server.hostname}</span>. Run{" "}
            <span className={classes.undiscoveredCommand}>analyze</span> here to reveal.
          </p>
        </div>
      )}

      <div className={classes.actionsGrid} data-target-actions>
        <QuickActionButton command="hack" primary disabled={baseDisabled} />
        <QuickActionButton command="weaken" disabled={baseDisabled} />
        <QuickActionButton command="grow" disabled={baseDisabled} />
        <QuickActionButton command="backdoor" disabled={backdoorDisabled} />
      </div>
    </div>
  );
}
