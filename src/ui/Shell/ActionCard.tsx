/**
 * Current-action card for the docked HUD (Task 4).
 *
 * Functional port of CharacterOverview's `Work` sub-component: covers all six work types
 * (Crime/Class/CreateProgram/Grafting/Faction/Company), hidden entirely when the player has no
 * current work or is already focused, and offers the same "Focus" action
 * (`Player.startFocusing(); Router.toPage(Page.Work)`).
 *
 * Visuals per design-notes-1A: bordered card (borderAccent), conic-gradient progress ring with a
 * hollow center, action title, subline, "Focus →" link. Work types without a bounded completion
 * percentage (class, faction, company) show an "∞" ring center instead of a fake percent.
 */
import React, { type ReactNode } from "react";
import { alpha, type Theme } from "@mui/material/styles";
import Tooltip from "@mui/material/Tooltip";
import { makeStyles } from "tss-react/mui";

import { Player } from "@player";
import { CONSTANTS } from "../../Constants";
import { Settings } from "../../Settings/Settings";
import { isClassWork } from "../../Work/ClassWork";
import { isCompanyWork } from "../../Work/CompanyWork";
import { isCreateProgramWork } from "../../Work/CreateProgramWork";
import { isCrimeWork } from "../../Work/CrimeWork";
import { isFactionWork } from "../../Work/FactionWork";
import { isGraftingWork } from "../../Work/GraftingWork";
import { convertTimeMsToTimeElapsedString } from "../../utils/StringHelperFunctions";
import { formatReputation } from "../formatNumber";
import { Router } from "../GameRoot";
import { Page } from "../Router";

const useStyles = makeStyles()((theme: Theme) => {
  const accentCyan = theme.colors.accentCyan as string;
  const track = theme.colors.track as string;
  return {
    // Card geometry per design notes. Mock card bg #0e161f has no token; bgPanel is the nearest.
    card: {
      backgroundColor: theme.colors.bgPanel,
      border: `1px solid ${theme.colors.borderAccent as string}`,
      borderRadius: "10px",
      padding: "14px",
      display: "flex",
      gap: "12px",
      alignItems: "center",
    },
    ringOuter: {
      width: "44px",
      height: "44px",
      flex: "none",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    // Hollow center per design notes: nested circle matching the HUD panel background.
    ringInner: {
      width: "34px",
      height: "34px",
      borderRadius: "50%",
      backgroundColor: theme.colors.bgSidebar,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    ringLabel: {
      fontFamily: Settings.styles.monoFontFamily,
      fontSize: "9px",
      fontWeight: 600,
      color: accentCyan,
    },
    text: {
      minWidth: 0,
      flex: 1,
    },
    title: {
      fontSize: "11.5px",
      fontWeight: 600,
      color: theme.colors.textPrimary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    subline: {
      fontSize: "10px",
      fontWeight: 400,
      color: theme.colors.textSecondary,
      marginTop: "1px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    focusLink: {
      display: "inline-block",
      fontSize: "10.5px",
      fontWeight: 600,
      color: accentCyan,
      marginTop: "5px",
      background: "none",
      border: "none",
      padding: 0,
      font: "inherit",
      cursor: "pointer",
      transition: "color 120ms ease-out",
      "&:hover": {
        color: alpha(accentCyan, 0.8),
      },
    },
    track: {
      // Exposed for the indefinite-work ring background.
      backgroundColor: track,
    },
  };
});

const onClickFocus = (): void => {
  Player.startFocusing();
  Router.toPage(Page.Work);
};

interface WorkDisplayInfo {
  title: ReactNode;
  subline: ReactNode;
  /** Full detail shown as a tooltip (mirrors the overview Work tooltip). */
  tooltip: ReactNode;
  /** Completion percent (0-100), or null for open-ended work. */
  progress: number | null;
}

/** Mirror of CharacterOverview's Work display logic, reshaped for the card layout. */
function getWorkDisplayInfo(work: NonNullable<typeof Player.currentWork>): WorkDisplayInfo | null {
  if (isCrimeWork(work)) {
    const crime = work.getCrime();
    const perc = (work.unitCompleted / crime.time) * 100;
    return {
      title: String(work.crimeType),
      subline: <>Attempting {crime.workName}</>,
      tooltip: <>You are attempting {crime.workName}</>,
      progress: perc,
    };
  }
  if (isClassWork(work)) {
    const youAreCurrently = work.getClass().youAreCurrently;
    return {
      title: youAreCurrently.charAt(0).toUpperCase() + youAreCurrently.slice(1),
      subline: <>{convertTimeMsToTimeElapsedString(work.cyclesWorked * CONSTANTS.MilliPerCycle)} elapsed</>,
      tooltip: <>You are {youAreCurrently}</>,
      progress: null,
    };
  }
  if (isCreateProgramWork(work)) {
    const perc = (work.unitCompleted / work.unitNeeded()) * 100;
    return {
      title: "Creating a program",
      subline: <>{work.programName}</>,
      tooltip: <>Coding {work.programName}</>,
      progress: perc,
    };
  }
  if (isGraftingWork(work)) {
    const perc = (work.unitCompleted / work.unitNeeded()) * 100;
    return {
      title: "Grafting an Augmentation",
      subline: <>{work.augmentation}</>,
      tooltip: <>Grafting {work.augmentation}</>,
      progress: perc,
    };
  }
  if (isFactionWork(work)) {
    const rate = work.getReputationRate() * (1000 / CONSTANTS.MilliPerCycle);
    return {
      title: <>Working for {work.factionName}</>,
      subline: (
        <>
          {formatReputation(work.getFaction().playerReputation)} rep (+{formatReputation(rate)}/s)
        </>
      ),
      tooltip: <>Doing {work.factionWorkType} work</>,
      progress: null,
    };
  }
  if (isCompanyWork(work)) {
    const job = Player.jobs[work.companyName];
    // Mirrors the overview: no job at this company means nothing to show.
    if (!job) return null;
    const rate = work.getGainRates(job).reputation * (1000 / CONSTANTS.MilliPerCycle);
    return {
      title: <>Working at {work.companyName}</>,
      subline: (
        <>
          {formatReputation(work.getCompany().playerReputation)} rep (+{formatReputation(rate)}/s)
        </>
      ),
      tooltip: <>{job}</>,
      progress: null,
    };
  }
  return null;
}

export function ActionCard(): React.ReactElement | null {
  const { classes, cx, theme } = useStyles();
  // Hidden entirely when there is no work or the player is already focused (mirrors the overview).
  if (Player.currentWork === null || Player.focus) return null;
  const info = getWorkDisplayInfo(Player.currentWork);
  if (!info) return null;

  const accentCyan = theme.colors.accentCyan as string;
  const track = theme.colors.track as string;
  const ringStyle =
    info.progress === null
      ? undefined
      : { background: `conic-gradient(${accentCyan} ${Math.min(100, Math.max(0, info.progress))}%, ${track} 0)` };

  return (
    <Tooltip title={<>{info.tooltip}</>}>
      <div className={classes.card} data-hud-action>
        <div className={cx(classes.ringOuter, info.progress === null && classes.track)} style={ringStyle}>
          <div className={classes.ringInner}>
            <span className={classes.ringLabel}>{info.progress === null ? "∞" : `${Math.floor(info.progress)}%`}</span>
          </div>
        </div>
        <div className={classes.text}>
          <div className={classes.title}>{info.title}</div>
          <div className={classes.subline}>{info.subline}</div>
          <button type="button" className={classes.focusLink} onClick={onClickFocus}>
            Focus →
          </button>
        </div>
      </div>
    </Tooltip>
  );
}
