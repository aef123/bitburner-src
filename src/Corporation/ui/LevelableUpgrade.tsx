// React components for the levelable upgrade buttons on the overview panel
import React from "react";

import { dialogBoxCreate } from "../../ui/React/DialogBox";
import { CorporationUpgrade } from "../data/CorporationUpgrades";
import { LevelUpgrade } from "../Actions";
import { MoneyCost } from "./MoneyCost";
import { useCorporation } from "./Context";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import { calculateMaxAffordableUpgrade, calculateUpgradeCost } from "../helpers";

interface IProps {
  upgrade: CorporationUpgrade;
  amount: number | "MAX";
  rerender: () => void;
}

export function LevelableUpgrade(props: IProps): React.ReactElement {
  const corp = useCorporation();
  const data = props.upgrade;
  const level = corp.upgrades[data.index];
  const amount = props.amount;

  const maxUpgrades = amount === "MAX" ? calculateMaxAffordableUpgrade(corp, data, amount) : amount;
  const cost = calculateUpgradeCost(corp, data, maxUpgrades);
  const tooltip = data.desc;
  function onClick(): void {
    if (corp.funds < cost) return;
    try {
      LevelUpgrade(corp, props.upgrade, maxUpgrades);
    } catch (err) {
      dialogBoxCreate(err + "");
    }
    props.rerender();
  }

  return (
    <Grid item xs={4}>
      <Box display="flex" alignItems="center" flexDirection="row-reverse">
        <Button disabled={corp.funds < cost} sx={{ mx: 1 }} onClick={onClick}>
          +{maxUpgrades} -&nbsp;
          <MoneyCost money={cost} corp={corp} />
        </Button>
        <Tooltip title={tooltip}>
          <Typography>
            {data.name} - lvl {level}
          </Typography>
        </Tooltip>
      </Box>
    </Grid>
  );
}
