// Accessibility helpers used across the app:
//  * announce(msg): read a message out on screen readers (polite live region);
//  * page changes: update the tab title, announce the page and move focus to the content;
//  * heading levels never skip (h1 → h3 is exposed as h1 → h2), so heading navigation makes sense;
//  * scrollable tables/lists can be reached and scrolled with the keyboard;
//  * any element with data-profile that is focusable opens the profile with Enter/Space.
const APP = "Winner League Arcade";
let live = null, firstRoute = true, timer = null;

export function announce(msg, { assertive = false } = {}) {
  if (!live) return;
  const el = assertive ? live.assertive : live.polite;
  el.textContent = "";
  // a new text node after a tick, so repeated messages are read again
  setTimeout(() => { el.textContent = msg; }, 60);
}

function visible(el) {
  return !el.closest("[hidden], [aria-hidden='true'], .sr-only-skip") && el.getClientRects().length > 0;
}

export function normalizeHeadings(root = document.body) {
  let prev = 0;
  for (const h of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    if (!visible(h)) continue;
    const real = Number(h.tagName[1]);
    const level = prev === 0 ? real : Math.min(real, prev + 1);
    if (level !== real) { h.setAttribute("role", "heading"); h.setAttribute("aria-level", String(level)); h.dataset.a11yLevel = "1"; }
    else if (h.dataset.a11yLevel) { h.removeAttribute("role"); h.removeAttribute("aria-level"); delete h.dataset.a11yLevel; }
    prev = level;
  }
}

const SCROLLERS = ".grid-wrap, .name-list, .sm-results, .pbp, .hist-list";
function fixScrollers(root = document.body) {
  for (const el of root.querySelectorAll(SCROLLERS)) {
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    if (!el.getAttribute("role")) el.setAttribute("role", "region");
    if (!el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby")) {
      const heading = el.closest(".card, section, dialog")?.querySelector("h1, h2, h3, h4");
      el.setAttribute("aria-label", heading ? `${heading.textContent.trim()} (scrollable)` : "Scrollable area");
    }
  }
}

function sweep() { timer = null; normalizeHeadings(); fixScrollers(); }
const schedule = () => { if (!timer) timer = setTimeout(sweep, 80); };

/** Called by the router after a page renders. */
export function pageChanged(view) {
  setTimeout(() => {
    const h1 = view.querySelector("h1");
    const name = h1 ? h1.textContent.replace(/\s+/g, " ").trim() : "";
    document.title = name && name !== APP ? `${name} · ${APP}` : APP;
    if (firstRoute) { firstRoute = false; return; }
    announce(name ? `${name} page` : "Page loaded");
    const active = document.activeElement;
    if (!active || active === document.body || !document.contains(active) || !view.contains(active)) view.focus({ preventScroll: true });
  }, 150);
}

export function initA11y() {
  live = { polite: document.createElement("div"), assertive: document.createElement("div") };
  live.polite.className = live.assertive.className = "sr-only";
  live.polite.setAttribute("aria-live", "polite");
  live.assertive.setAttribute("aria-live", "assertive");
  live.polite.id = "sr-live";
  document.body.append(live.polite, live.assertive);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("[data-profile]:not(button):not(a)[tabindex]")) { e.preventDefault(); e.target.click(); }
  });
  // skip link: jump to the page content without changing the route
  document.querySelector(".skip-link")?.addEventListener("click", (e) => { e.preventDefault(); document.getElementById("view").focus(); });
}
