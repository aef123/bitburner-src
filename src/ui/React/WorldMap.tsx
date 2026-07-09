import React from "react";
import { makeStyles } from "tss-react/mui";
import { Tooltip, Typography } from "@mui/material";
import { Theme } from "@mui/material/styles";

import { CityName } from "@enums";

import { CITY_LETTER_TO_NAME, WORLD_MAP_ART } from "./worldMapArt";

interface ICityProps {
  currentCity: CityName;
  city: CityName;
  onTravel: (city: CityName) => void;
}

const useStyles = makeStyles()((theme: Theme) => ({
  travel: {
    color: theme.colors.maplocation,
    lineHeight: "1em",
    whiteSpace: "pre",
    cursor: "pointer",
  },
  currentCity: {
    color: theme.colors.disabled,
    lineHeight: "1em",
    whiteSpace: "pre",
  },
}));

function City(props: ICityProps): React.ReactElement {
  const { classes } = useStyles();
  if (props.city !== props.currentCity) {
    return (
      <Tooltip title={<Typography>{props.city}</Typography>}>
        <span onClick={() => props.onTravel(props.city)} className={classes.travel}>
          {props.city[0]}
        </span>
      </Tooltip>
    );
  }
  return <span className={classes.currentCity}>{props.city[0]}</span>;
}

interface IProps {
  currentCity: CityName;
  onTravel: (city: CityName) => void;
}

/**
 * The classic ASCII world map, rendered from the shared art source
 * (worldMapArt.ts). Each city letter in the art becomes a clickable <City/>
 * element; everything else renders as plain text, character-for-character
 * identical to the original hand-written JSX.
 */
export function WorldMap(props: IProps): React.ReactElement {
  return (
    <>
      {WORLD_MAP_ART.map((line, row) => {
        const children: React.ReactNode[] = [];
        let text = "";
        for (const char of line) {
          const city = CITY_LETTER_TO_NAME[char];
          if (!city) {
            text += char;
            continue;
          }
          if (text) children.push(text);
          text = "";
          children.push(<City key={city} onTravel={props.onTravel} currentCity={props.currentCity} city={city} />);
        }
        if (text) children.push(text);
        return (
          <Typography key={row} sx={{ lineHeight: "1em", whiteSpace: "pre" }}>
            {children}
          </Typography>
        );
      })}
    </>
  );
}
