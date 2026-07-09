/**
 * The Active Scripts page (1F redesign): page header + kill-all, Network RAM header
 * card (stacked bar + totals), filter/pagination controls (kept — load-bearing for
 * 1000s of scripts, mock omits them), and collapsible per-server groups.
 *
 * Token mapping (Stage 1 derivation precedent): the header stats strip's #9fb1c1 →
 * textSecondary (WorldMap3A call); kill-all border #4a2530 → alpha(accentRed, 0.3)
 * (same derivation as ScriptRow's kill button).
 */
import type { WorkerScript } from "../../Netscript/WorkerScript";
import type { BaseServer } from "../../Server/BaseServer";

import React, { useState } from "react";
import { alpha, type Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { MenuItem, Select, SelectChangeEvent, TextField, IconButton, Typography } from "@mui/material";
import { FirstPage, KeyboardArrowLeft, KeyboardArrowRight, LastPage, Search } from "@mui/icons-material";

import { Player } from "@player";
import { killAllScripts } from "../../Netscript/killWorkerScript";
import { workerScripts } from "../../Netscript/WorkerScripts";
import { GetAllServers } from "../../Server/AllServers";
import { SpecialServers } from "../../Server/data/SpecialServers";
import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import { isPositiveInteger } from "../../types";
import { formatExp, formatMoney, formatRam } from "../formatNumber";
import { aggregateNetworkRam, totalExpRate, totalMoneyRate } from "./networkRam";
import { NetworkRamBar } from "./NetworkRamBar";
import { ServerGroup } from "./ServerGroup";

const useStyles = makeStyles()((theme: Theme) => {
  const typeScale = getTypeScale();
  return {
  headerRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "12px",
    margin: "14px 0 18px",
  },
  title: {
    fontFamily: Settings.styles.fontFamily,
    fontSize: typeScale.title, // mock: 20px
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontFamily: Settings.styles.fontFamily,
    fontSize: typeScale.body, // mock: 12px
    color: theme.colors.textSecondary,
  },
  spacer: {
    flex: 1,
  },
  killAll: {
    fontFamily: Settings.styles.fontFamily,
    fontSize: typeScale.body, // mock: 11.5px
    fontWeight: 500,
    color: theme.colors.accentRed,
    border: `1px solid ${alpha(theme.colors.accentRed as string, 0.3)}`,
    borderRadius: "8px",
    padding: "6px 14px",
    backgroundColor: "transparent",
    cursor: "pointer",
    transition: "border-color 120ms ease-out",
    "&:hover": {
      borderColor: alpha(theme.colors.accentRed as string, 0.55),
    },
  },
  ramCard: {
    backgroundColor: theme.colors.bgPanel,
    border: `1px solid ${theme.colors.borderCard as string}`,
    borderRadius: "12px",
    padding: "16px 18px",
    marginBottom: "18px",
  },
  ramCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: "9px",
    gap: "12px",
    flexWrap: "wrap",
  },
  ramCardLabel: {
    fontFamily: Settings.styles.fontFamily,
    fontSize: typeScale.body, // mock: 12px
    fontWeight: 500,
    color: theme.colors.textBody,
  },
  ramCardStats: {
    display: "flex",
    gap: "22px",
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.value, // mock: 11px
    fontWeight: 500,
    flexWrap: "wrap",
  },
  statUsed: {
    color: theme.colors.textSecondary,
  },
  statIncome: {
    color: theme.colors.accentGold,
  },
  statExp: {
    color: theme.colors.accentCyan,
  },
  // Preserves the old ScriptProduction "total since last augmentation" figure.
  sinceAug: {
    fontFamily: Settings.styles.fontFamily,
    fontSize: typeScale.caption, // mock: 10px
    fontWeight: 500,
    color: theme.colors.textTertiary,
    marginTop: "7px",
    textAlign: "right",
  },
  controlsRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "14px",
    flexWrap: "wrap",
  },
  controlsLabel: {
    fontFamily: Settings.styles.fontFamily,
    fontSize: typeScale.caption, // mock: 11px
    fontWeight: 500,
    color: theme.colors.textTertiary,
    marginLeft: "8px",
  },
  pageIndicator: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.caption, // mock: 10.5px
    fontWeight: 500,
    color: theme.colors.textTertiary,
    marginLeft: "auto",
    marginRight: "4px",
  },
  emptyState: {
    fontFamily: Settings.styles.fontFamily,
    fontSize: typeScale.body, // mock: 12px
    color: theme.colors.textTertiary,
    padding: "24px 0",
    textAlign: "center",
  },
  };
});

interface IProps {
  serverName?: string;
}

export function ActiveScriptsPage(props: IProps): React.ReactElement {
  const { classes } = useStyles();
  const [scriptsPerPage, setScriptsPerPage] = useState(Settings.ActiveScriptsScriptPageSize);
  const [serversPerPage, setServersPerPage] = useState(Settings.ActiveScriptsServerPageSize);
  const [filter, setFilter] = useState(props.serverName ?? "");
  const [page, setPage] = useState(0);

  function changeScriptsPerPage(e: SelectChangeEvent<number>) {
    const n = parseInt(e.target.value as string);
    if (!isPositiveInteger(n)) return;
    Settings.ActiveScriptsScriptPageSize = n;
    setScriptsPerPage(n);
  }
  function changeServersPerPage(e: SelectChangeEvent<number>) {
    const n = parseInt(e.target.value as string);
    if (!isPositiveInteger(n)) return;
    Settings.ActiveScriptsServerPageSize = n;
    setServersPerPage(n);
  }

  // Creating and sorting the server data array is done here
  const serverData: [BaseServer, WorkerScript[]][] = (() => {
    const tempData: Map<BaseServer, WorkerScript[]> = new Map();
    if (filter) {
      // Only check filtering if a filter exists (performance)
      for (const ws of workerScripts.values()) {
        if (!ws.hostname.includes(filter) && !ws.scriptRef.filename.includes(filter)) continue;
        const server = ws.getServer();
        const serverScripts = tempData.get(server);
        if (serverScripts) serverScripts.push(ws);
        else tempData.set(server, [ws]);
      }
    } else {
      for (const ws of workerScripts.values()) {
        const server = ws.getServer();
        const serverScripts = tempData.get(server);
        if (serverScripts) serverScripts.push(ws);
        else tempData.set(server, [ws]);
      }
    }
    // serverData will be based on a sorted array from the temporary Map
    return [...tempData].sort(([serverA], [serverB]) => {
      // Servers not owned by the player are equal for sorting. Earliest return because it is the most common comparison.
      if (!serverA.purchasedByPlayer && !serverB.purchasedByPlayer) return 0;
      // Servers owned by the player come earlier in the sorting
      if (serverA.purchasedByPlayer && !serverB.purchasedByPlayer) return -1;
      if (!serverA.purchasedByPlayer && serverB.purchasedByPlayer) return 1;
      // If we have reached this point, then both servers are player owned
      // Home is at the top
      if (serverA.hostname === SpecialServers.Home) return -1;
      if (serverB.hostname === SpecialServers.Home) return 1;
      // Hacknet servers shown after home
      if (serverA.isHacknetServer && !serverB.isHacknetServer) return -1;
      if (!serverA.isHacknetServer && serverB.isHacknetServer) return 1;
      // Sorting for hacknet servers is based on the numbered suffix
      if (serverA.isHacknetServer) {
        if (serverA.hostname.length < serverB.hostname.length) return -1;
        if (serverA.hostname.length > serverB.hostname.length) return 1;
        // Get the numbered suffix from the end of the server names
        const numA = Math.abs(parseInt(serverA.hostname.slice(-2)));
        const numB = Math.abs(parseInt(serverB.hostname.slice(-2)));
        if (numA < numB) return -1;
        return 1;
      }
      // Sorting for other cloud servers is alphabetical. There's probably a better way to do this.
      const fakeArray = [serverA.hostname, serverB.hostname].sort();
      if (serverA.hostname === fakeArray[0]) return -1;
      return 1;
    });
  })();

  const lastPage = Math.max(Math.ceil(serverData.length / serversPerPage) - 1, 0);
  function changePage(n: number) {
    if (!Number.isInteger(n) || n > lastPage || n < 0) return;
    setPage(n);
  }
  if (page > lastPage) changePage(lastPage);

  const adjustedIndex = page * serversPerPage;
  const dataToShow = serverData.slice(adjustedIndex, adjustedIndex + serversPerPage);
  const firstServerNumber = serverData.length === 0 ? 0 : adjustedIndex + 1;
  const lastServerNumber = serverData.length === 0 ? 0 : adjustedIndex + dataToShow.length;

  // Header stats reflect the whole network, not the filtered view.
  // Pass showDarkweb=true so darknet servers with admin rights are counted in the
  // rooted bucket — they can run player scripts and are visible in the list below,
  // so excluding them would make the totals contradict the per-server RAM bars.
  const ramTotals = aggregateNetworkRam(GetAllServers(true));
  let hostCount = 0;
  {
    const hosts = new Set<string>();
    for (const ws of workerScripts.values()) hosts.add(ws.hostname);
    hostCount = hosts.size;
  }
  const expRate = totalExpRate([...workerScripts.values()].map((ws) => ws.scriptRef));
  // Live money rate: same per-script sum the group rows use (onlineMoneyMade / onlineRunningTime),
  // so the header total always equals the sum of the visible group income figures.
  const moneyRate = totalMoneyRate([...workerScripts.values()].map((ws) => ws.scriptRef));

  return (
    <>
      <div className={classes.headerRow}>
        <span className={classes.title}>Active scripts</span>
        <span className={classes.subtitle}>
          {workerScripts.size} {workerScripts.size === 1 ? "process" : "processes"} on {hostCount}{" "}
          {hostCount === 1 ? "server" : "servers"}
        </span>
        <span className={classes.spacer} />
        {/* Same behavior as before the redesign: no confirmation prompt. */}
        <button className={classes.killAll} data-kill-all onClick={killAllScripts}>
          Kill all scripts
        </button>
      </div>

      <div className={classes.ramCard} data-network-ram-card>
        <div className={classes.ramCardHeader}>
          <span className={classes.ramCardLabel}>Network RAM</span>
          <span className={classes.ramCardStats}>
            <span className={classes.statUsed}>
              {formatRam(ramTotals.totalUsed)} / {formatRam(ramTotals.totalMax)} used
            </span>
            <span className={classes.statIncome}>income {formatMoney(moneyRate)}/s</span>
            <span className={classes.statExp}>hack exp {formatExp(expRate)}/s</span>
          </span>
        </div>
        <NetworkRamBar totals={ramTotals} />
        <div className={classes.sinceAug}>
          total {formatMoney(Player.scriptProdSinceLastAug)} earned since last augmentation
        </div>
      </div>

      <div className={classes.controlsRow}>
        <TextField
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
          placeholder="Filter by server or script…"
          InputProps={{ startAdornment: <Search />, spellCheck: false }}
          size="small"
        />
        <Typography component="span" className={classes.controlsLabel}>
          Servers/page
        </Typography>
        <Select size="small" value={serversPerPage} onChange={changeServersPerPage}>
          <MenuItem value={10}>10</MenuItem>
          <MenuItem value={15}>15</MenuItem>
          <MenuItem value={20}>20</MenuItem>
          <MenuItem value={100}>100</MenuItem>
        </Select>
        <Typography component="span" className={classes.controlsLabel}>
          Scripts/page
        </Typography>
        <Select size="small" value={scriptsPerPage} onChange={changeScriptsPerPage}>
          <MenuItem value={10}>10</MenuItem>
          <MenuItem value={15}>15</MenuItem>
          <MenuItem value={20}>20</MenuItem>
          <MenuItem value={100}>100</MenuItem>
        </Select>
        <span className={classes.pageIndicator}>
          {firstServerNumber}-{lastServerNumber} of {serverData.length}
        </span>
        <IconButton size="small" onClick={() => changePage(0)} disabled={page === 0}>
          <FirstPage fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={() => changePage(page - 1)} disabled={page === 0}>
          <KeyboardArrowLeft fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={() => changePage(page + 1)} disabled={page === lastPage}>
          <KeyboardArrowRight fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={() => changePage(lastPage)} disabled={page === lastPage}>
          <LastPage fontSize="small" />
        </IconButton>
      </div>

      {dataToShow.length === 0 && (
        <div className={classes.emptyState}>
          {filter ? "No running scripts match the filter." : "No scripts are running."}
        </div>
      )}
      {dataToShow.map(([server, scripts]) => (
        <ServerGroup key={server.hostname} server={server} scripts={scripts} startOpen={!!props.serverName} />
      ))}
    </>
  );
}
