// Display units chosen in Settings: height in metres or feet/inches, money in dollars or shekels.
import { store } from "../ui.js";

/** Conversion used for shekel display. An approximate, fixed rate (shown in Settings), not a live one. */
export const ILS_PER_USD = 3.7;

const units = () => ({ height: "m", money: "usd", ...store.get("units", {}) });
export const getUnits = units;
export function setUnits(patch) {
  store.set("units", { ...units(), ...patch });
  document.dispatchEvent(new CustomEvent("units-changed"));
}

/** 196 → "1.96 m" or "6'5\"". */
export function fmtHeight(cm) {
  if (!cm) return "–";
  if (units().height === "ft") {
    const inches = Math.round(cm / 2.54);
    return `${Math.floor(inches / 12)}'${inches % 12}"`;
  }
  return `${(cm / 100).toFixed(2)} m`;
}

/** Dollars in, formatted in the chosen currency ("$187,000" or "₪692,000"). */
export function fmtMoney(usd) {
  const ils = units().money === "ils";
  const v = Math.round(ils ? usd * ILS_PER_USD : usd);
  return `${v < 0 ? "−" : ""}${ils ? "₪" : "$"}${Math.abs(v).toLocaleString("en-US")}`;
}

/** A guess-the-player clue cell value, with height shown in the chosen unit ("196 cm" comes from the shared logic). */
export const clueValue = (k, cell) => (k === "height" && /^\d+ cm$/.test(cell.v) ? fmtHeight(parseInt(cell.v, 10)) : cell.v);
