// Modal helpers:
//  * openModal(dialog): opens a <dialog> and adds a history entry, so the browser Back button
//    (or the phone's back gesture) closes the dialog instead of leaving the page.
//  * confirmDialog(...): styled replacement for window.confirm(), returns a Promise<boolean>.
import { esc } from "../ui.js";
import { icon } from "./icons.js";

let closingFromHistory = false;

function dropHistoryEntry(d) {
  // remove the history entry this dialog added (unless Back already removed it)
  if (d._pushed && !closingFromHistory) {
    d._pushed = false;
    if (history.state?.wlaModal) history.back();
  }
  d._pushed = false;
}

export function openModal(d, { reuseEntry = false } = {}) {
  if (!d._wlaManaged) {
    d._wlaManaged = true;
    // Esc: close through closeModal so history stays in sync (the "close" event can be delayed)
    d.addEventListener("cancel", (e) => { e.preventDefault(); closeModal(d); });
    d.addEventListener("close", () => dropHistoryEntry(d)); // fallback for any other close path
  }
  if (!d.open) d.showModal();
  if (!d._pushed) {
    // reuseEntry: take over the history entry of a dialog that just closed silently (search -> profile)
    if (!reuseEntry) history.pushState({ wlaModal: true }, "");
    d._pushed = true;
  }
}

/** Close a dialog opened with openModal (✕ button, backdrop, Esc). */
export function closeModal(d) {
  if (!d.open) return;
  dropHistoryEntry(d);
  d.close();
}

/** Close a dialog without touching history (used when the page itself is changing). */
export function closeSilently(d) {
  d._pushed = false;
  if (d.open) d.close();
}

window.addEventListener("popstate", () => {
  const open = [...document.querySelectorAll("dialog[open]")].pop();
  if (!open) return;
  closingFromHistory = true;
  open._pushed = false;
  open.close();
  closingFromHistory = false;
});

/** Styled confirm dialog. */
export function confirmDialog({ title = "Are you sure?", message = "", ok = "OK", cancel = "Cancel", danger = false } = {}) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "confirm-modal";
    d.setAttribute("aria-labelledby", "cf-title");
    d.innerHTML = `<div class="cf-icon ${danger ? "danger" : ""}">${icon(danger ? "x" : "info", { size: 26 })}</div>
      <h2 id="cf-title">${esc(title)}</h2>${message ? `<p class="muted">${esc(message)}</p>` : ""}
      <div class="row cf-actions"><button class="btn ghost" data-v="0">${esc(cancel)}</button><button class="btn ${danger ? "danger" : "primary"}" data-v="1">${esc(ok)}</button></div>`;
    document.body.appendChild(d);
    let done = false;
    const finish = (result) => { if (done) return; done = true; if (d.open) d.close(); d.remove(); resolve(result); };
    d.addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]");
      if (b) finish(b.dataset.v === "1");
      else if (e.target === d) finish(false);
    });
    d.addEventListener("cancel", (e) => { e.preventDefault(); finish(false); });
    d.addEventListener("close", () => finish(false));
    d.showModal();
    d.querySelector('[data-v="1"]').focus();
  });
}
