// The shop's catalog: everything that can be bought with Buckets, and today's deals.
// Looks (avatar, frames, profile cards, courts, stickers), extra modes, single-use helpers for
// single-player games, and a style for your friend leagues. Nothing here changes an online result.
import { seededRng } from "../data.js";
import { localDate } from "../ui.js";
import { EXTRAS, HAIRS, PREMIUM_AV } from "./avatarArt.js";
import { owns, wallet } from "./wallet.js";

export const CATEGORIES = [
  ["deals", "Today's deals", "star"], ["avatar", "Avatar", "user"], ["frame", "Frames", "shield"], ["card", "Profile cards", "camera"],
  ["court", "Courts", "arena"], ["sticker", "Stickers", "chat"], ["mode", "Modes", "games"], ["helper", "Helpers", "bulb"], ["league", "Leagues", "trophy"],
];

const av = (slot, id, price) => ({ id: `av:${slot}:${id}`, cat: "avatar", name: slot === "hair" ? HAIRS[id] : EXTRAS[id], price, slot, value: id,
  desc: slot === "hair" ? "A hairstyle for your player avatar." : "An extra for your player avatar." });

export const ITEMS = [
  ...PREMIUM_AV.hair.map((h, i) => av("hair", h, [250, 200, 220][i])),
  ...PREMIUM_AV.x.map((x, i) => av("x", x, [180, 400, 300, 250, 150][i])),

  { id: "frame:neon", cat: "frame", name: "Neon", price: 350, desc: "A glowing cyan frame." },
  { id: "frame:royal", cat: "frame", name: "Royal", price: 450, desc: "Purple and gold." },
  { id: "frame:ice", cat: "frame", name: "Ice", price: 400, desc: "Cold as a buzzer-beater." },
  { id: "frame:rainbow", cat: "frame", name: "Rainbow", price: 600, desc: "Every colour, slowly turning." },
  { id: "frame:net", cat: "frame", name: "Net", price: 300, desc: "The white of a fresh net." },

  { id: "card:night", cat: "card", name: "Night game", price: 250, desc: "Your profile card under the arena lights." },
  { id: "card:gold", cat: "card", name: "Gold edition", price: 400, desc: "A gold profile card." },
  { id: "card:hardwood", cat: "card", name: "Hardwood", price: 300, desc: "Parquet floor behind your profile." },
  { id: "card:bluewhite", cat: "card", name: "Blue & white", price: 300, desc: "Stripes in blue and white." },

  { id: "court:night", cat: "court", name: "Night court", price: 250, desc: "Dark wood for the live games." },
  { id: "court:street", cat: "court", name: "Street", price: 300, desc: "Outdoor asphalt, painted lines." },
  { id: "court:retro", cat: "court", name: "Retro 90s", price: 300, desc: "Light maple and purple paint." },
  { id: "court:finals", cat: "court", name: "Final Four", price: 450, desc: "Navy floor, gold lines." },
  { id: "court:beach", cat: "court", name: "Beach", price: 200, desc: "Sand and sea-blue paint." },

  ...[["bang", "BANG!"], ["splash", "SPLASH"], ["brick", "BRICK"], ["dagger", "DAGGER"], ["clutch", "CLUTCH"], ["lockdown", "LOCKDOWN"], ["mvp", "MVP"], ["posterized", "POSTERIZED"]]
    .map(([id, text]) => ({ id: `sticker:${id}`, cat: "sticker", name: text, price: 80, sticker: id, desc: "A sticker to send in online matches." })),

  { id: "mode:draft-underdogs", cat: "mode", name: "Draft: Underdogs", price: 450, desc: "An All-Time Draft option: only players rated 84 or lower." },
  { id: "mode:draft-young", cat: "mode", name: "Draft: Young guns", price: 450, desc: "An All-Time Draft option: only seasons when the player was 23 or younger." },
  { id: "mode:hl-close", cat: "mode", name: "Higher or Lower: Close calls", price: 400, desc: "A Higher or Lower option: the two numbers are always within 15% of each other." },

  { id: "token:hint", cat: "helper", kind: "token", token: "hint", count: 3, name: "3 free hints", price: 60,
    desc: "A hint that costs nothing: in Guess the Player (no guess used) or Career Path (no point lost). Unlimited and solo games only." },
  { id: "token:respin", cat: "helper", kind: "token", token: "respin", count: 3, name: "3 extra re-spins", price: 60,
    desc: "One more re-spin in a solo All-Time Draft once yours are used." },

  { id: "league:style", cat: "league", name: "League colours", price: 300, desc: "Give the friend leagues you create a colour and an icon, seen by every member." },
];
export const itemById = new Map(ITEMS.map((i) => [i.id, i]));

/** Today's three deals (30% off): the same for everyone all day, whatever you buy meanwhile. */
export function todaysDeals(date = localDate()) {
  const rnd = seededRng("shop-" + date);
  const pool = ITEMS.filter((i) => i.kind !== "token");
  const out = [];
  while (out.length < 3) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out.map((i) => ({ ...i, deal: true }));
}
export const DEAL_OFF = 0.3;
/** The price today: 30% off when the item is one of today's deals. */
export const priceOf = (item) => (todaysDeals().some((d) => d.id === item.id) ? Math.round(item.price * (1 - DEAL_OFF)) : item.price);

/** Sticker ids this player can send online (the free ones plus any bought). */
export const ownedStickers = () => ITEMS.filter((i) => i.cat === "sticker" && owns(i.id)).map((i) => [i.sticker, i.name]);
/** A bought mode is on offer in its game. */
export const hasMode = (id) => owns(`mode:${id}`);
export const ownedCount = () => Object.keys(wallet().owned).length;
