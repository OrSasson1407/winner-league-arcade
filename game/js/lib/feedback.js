// "Send feedback": report a bug or suggest an idea. Goes to this site's own server (/api/feedback), nowhere else.
import { esc, toast } from "../ui.js";
import { icon } from "./icons.js";
import { closeModal, openModal } from "./modal.js";
import { announce } from "./a11y.js";

export const APP_VERSION = "2026.10";
const KINDS = [["bug", "bug", "Bug"], ["idea", "bulb", "Idea"], ["other", "chat", "Other"]];

/** Open the feedback form. kind: "bug" | "idea" | "other"; detail: technical text attached to a bug report. */
export function openFeedback({ kind = "idea", detail = "" } = {}) {
  const d = document.createElement("dialog");
  d.className = "confirm-modal fb-modal";
  d.setAttribute("aria-labelledby", "fb-title");
  const tech = () => [`Page: ${location.hash || "#/"}`, `App: ${APP_VERSION}`, `Screen: ${innerWidth}×${innerHeight}`, `Browser: ${navigator.userAgent}`, detail && `Error: ${detail}`].filter(Boolean).join("\n");
  d.innerHTML = `<form method="dialog" class="fb-form">
      <div class="row"><h2 id="fb-title">${icon("chat", { size: 20 })} Send feedback</h2><span class="spacer"></span><button type="button" class="icon-btn" data-x aria-label="Close">${icon("close", { size: 18 })}</button></div>
      <fieldset class="fb-kinds"><legend class="sr-only">Type</legend>${KINDS.map(([k, ic, l]) => `<label class="fb-kind"><input type="radio" name="kind" value="${k}" ${k === kind ? "checked" : ""}><span>${icon(ic, { size: 16 })} ${l}</span></label>`).join("")}</fieldset>
      <label for="fb-msg" class="fb-label">${kind === "bug" ? "What happened? What did you expect?" : "Your message"}</label>
      <textarea id="fb-msg" class="input" rows="5" maxlength="1500" required placeholder="Write here…"></textarea>
      <label class="fb-check"><input type="checkbox" id="fb-tech" checked> Attach technical info</label>
      <details class="fb-details"><summary>What gets attached</summary><pre>${esc(tech())}</pre></details>
      <p class="muted fb-note">Sent only to this site's server. Don't include personal details: no names, emails or phone numbers are needed. See the <a href="#/privacy">privacy page</a>.</p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-x>Cancel</button><button type="submit" class="btn primary" id="fb-send">${icon("send", { size: 15 })} Send</button></div>
    </form>`;
  document.body.appendChild(d);
  const close = () => { closeModal(d); setTimeout(() => d.remove(), 300); };
  d.querySelectorAll("[data-x]").forEach((b) => b.addEventListener("click", close));
  d.addEventListener("close", () => setTimeout(() => d.remove(), 300));
  d.querySelector("a[href='#/privacy']").addEventListener("click", close);
  d.querySelector(".fb-kinds").addEventListener("change", (e) => {
    d.querySelector(".fb-label").textContent = e.target.value === "bug" ? "What happened? What did you expect?" : "Your message";
  });
  d.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = d.querySelector("#fb-msg").value.trim();
    if (msg.length < 3) { d.querySelector("#fb-msg").focus(); return; }
    const btn = d.querySelector("#fb-send");
    btn.disabled = true; btn.textContent = "Sending…";
    const body = { kind: d.querySelector("input[name=kind]:checked").value, message: msg, tech: d.querySelector("#fb-tech").checked ? tech() : "" };
    try {
      const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(res.status === 429 ? "busy" : "failed");
      close();
      toast("Thanks! Your feedback was sent.");
      announce("Feedback sent. Thank you.");
    } catch (err) {
      btn.disabled = false; btn.innerHTML = `${icon("send", { size: 15 })} Send`;
      toast(err.message === "busy" ? "Too many messages. Try again in a while." : navigator.onLine ? "Couldn't send. Try again in a moment." : "You're offline. Send it when you're back online.");
    }
  });
  openModal(d);
  d.querySelector("#fb-msg").focus();
}
