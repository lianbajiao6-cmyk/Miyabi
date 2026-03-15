"use strict";

const ADMIN_CODE = "3230043377";
const PASS_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;

function gen4DigitPin() {
return Math.floor(1000 + Math.random() * 9000).toString();
}

async function getClientIp() {
try {
const res = await fetch("/api/ip", { cache: "no-store" });
if (!res.ok) throw new Error("ip fetch");
const data = await res.json();
return data.ip || "unknown";
} catch {
return "unknown";
}
}

async function verifyPasscode(pin, ip) {
const res = await fetch("/api/verify", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ pin, ip }),
});
if (!res.ok) {
return { valid: false, message: (await res.json()).error || "invalid" };
}
const data = await res.json();
return { valid: data.valid };
}

async function createPasscode() {
const pin = gen4DigitPin();
const res = await fetch("/api/create", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ pin }),
});
if (!res.ok) {
throw new Error("Failed to create passcode");
}
return (await res.json()).pin;
}

async function resetAll() {
const res = await fetch("/api/reset", { method: "POST" });
return res.ok;
}

function setAppLocked(locked) {
const form = document.getElementById("uv-form");
const input = document.getElementById("uv-address");
const frame = document.getElementById("uv-frame");
const overlay = document.getElementById("auth-overlay");
if (!overlay) return;
if (locked) {
overlay.style.display = "flex";
if (form) form.style.pointerEvents = "none";
if (input) input.disabled = true;
if (frame) frame.style.display = "none";
} else {
overlay.style.display = "none";
if (form) form.style.pointerEvents = "auto";
if (input) input.disabled = false;
}
}

function createOverlay() {
const overlay = document.createElement("div");
overlay.id = "auth-overlay";
overlay.style = "position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:9999;display:flex;justify-content:center;align-items:center;padding:16px;";

const card = document.createElement("div");
card.style = "width:100%;max-width:520px;background:#161b2d;color:#fff;border-radius:12px;padding:20px;box-shadow:0 8px 30px rgba(0,0,0,0.45);";

const title = document.createElement("h2");
title.textContent = "Ultraviolet Gateway";
title.style.marginTop = "0";

const note = document.createElement("p");
note.textContent = "Enter your 4-digit passcode to unlock.";

const msg = document.createElement("p");
msg.id = "auth-message";
msg.style = "min-height:1.3rem;color:#f8b7b7;margin-bottom:8px;";

const form = document.createElement("form");
form.style = "display:grid;gap:8px;";
const input = document.createElement("input");
input.id = "auth-password";
input.placeholder = "Enter code";
input.autocomplete = "off";
input.style = "padding:10px;border-radius:6px;border:1px solid #445;background:#111;color:#fff;";
const submit = document.createElement("button");
submit.type = "submit";
submit.textContent = "Unlock";
submit.style = "padding:10px;border-radius:6px;border:none;background:#5f8bff;color:#fff;font-weight:700;cursor:pointer;";
form.append(input, submit);

const adminPanel = document.createElement("div");
adminPanel.id = "admin-panel";
adminPanel.style = "display:none;margin-top:12px;background:#0d172a;padding:10px;border-radius:8px;border:1px solid #355;";
adminPanel.innerHTML = `
<h3 style='margin:0 0 8px 0;color:#83c9ff;'>Admin Panel</h3>
<div style='display:flex;gap:8px;flex-wrap:wrap;'>
<button id='create-pass' style='padding:8px 10px;border:0;border-radius:6px;background:#2ea44f;color:#fff;cursor:pointer;'>Create passcode</button>
<button id='show-browser' style='padding:8px 10px;border:0;border-radius:6px;background:#5f8bff;color:#fff;cursor:pointer;'>Show browser</button>
<button id='reset-all' style='padding:8px 10px;border:0;border-radius:6px;background:#d73a49;color:#fff;cursor:pointer;'>Reset all</button>
</div>
<p id='admin-output' style='margin-top:8px;color:#dce6ff;min-height:1.2rem;'></p>
`;

form.addEventListener("submit", async (e) => {
e.preventDefault();
msg.style.color = "#f8b7b7";
const value = input.value.trim();
if (!value) {
msg.textContent = "Enter your code.";
return;
}
if (value === ADMIN_CODE) {
adminPanel.style.display = "block";
msg.style.color = "#8ef";
msg.textContent = "Admin unlocked.";
input.value = "";
return;
}
if (!/^\d{4}$/.test(value)) {
msg.textContent = "Code must be 4 digits.";
return;
}
const ip = await getClientIp();
const result = await verifyPasscode(value, ip);
if (!result.valid) {
msg.textContent = result.message || "Unauthorized";
return;
}
msg.style.color = "#7fffa1";
msg.textContent = "Unlocked.";
document.getElementById("auth-overlay").style.display = "none";
setAppLocked(false);
});

card.append(title, note, form, msg, adminPanel);
overlay.append(card);
return overlay;
}

async function initAuth() {
const ip = await getClientIp();
const overlay = createOverlay();
document.body.prepend(overlay);
setAppLocked(true);

const createBtn = document.getElementById("create-pass");
const showBtn = document.getElementById("show-browser");
const resetBtn = document.getElementById("reset-all");
const output = document.getElementById("admin-output");

createBtn?.addEventListener("click", async () => {
const pin = await createPasscode();
output.textContent = `New passcode: ${pin}`;
});

showBtn?.addEventListener("click", () => {
setAppLocked(false);
output.textContent = "Browser visible.";
});

resetBtn?.addEventListener("click", async () => {
await resetAll();
output.textContent = "All passcodes reset.";
setAppLocked(true);
});
}

const form = document.getElementById("uv-form");
const address = document.getElementById("uv-address");
const searchEngine = document.getElementById("uv-search-engine");
const error = document.getElementById("uv-error");
const errorCode = document.getElementById("uv-error-code");
const confirmClose = document.getElementById("confirm-close");
const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
const browserPanel = document.getElementById("browser-panel");
const settingsPanel = document.getElementById("settings-panel");
const connection = new BareMux.BareMuxConnection("/baremux/worker.js");

function setTab(tab) {
	if (tab === "settings") {
		browserPanel.classList.add("hidden");
		settingsPanel.classList.remove("hidden");
	} else {
		settingsPanel.classList.add("hidden");
		browserPanel.classList.remove("hidden");
	}
	tabButtons.forEach((btn) => {
		btn.classList.toggle("active", btn.dataset.tab === tab);
	});
}

function getConfirmCloseEnabled() {
	return localStorage.getItem("uv-confirm-close") !== "false";
}

function setConfirmCloseEnabled(enabled) {
	localStorage.setItem("uv-confirm-close", enabled ? "true" : "false");
	if (enabled) {
		window.onbeforeunload = (event) => {
			event.preventDefault();
			event.returnValue = "Are you sure you want to close this tab?";
			return "Are you sure you want to close this tab?";
		};
	} else {
		window.onbeforeunload = null;
	}
}

async function initApp() {
	await initAuth();

	setTab("browser");
	setConfirmCloseEnabled(getConfirmCloseEnabled());
	confirmClose?.addEventListener("change", () => {
		setConfirmCloseEnabled(confirmClose.checked);
	});
	if (confirmClose) {
		confirmClose.checked = getConfirmCloseEnabled();
	}
	tabButtons.forEach((button) => {
		button?.addEventListener("click", () => {
			setTab(button.dataset.tab || "browser");
		});
	});

	form?.addEventListener("submit", async (event) => {
		event.preventDefault();
		const overlay = document.getElementById("auth-overlay");
		if (overlay?.style.display !== "none") {
			error.textContent = "Unlock first.";
			return;
		}
		try {
			await registerSW();
		} catch (err) {
			error.textContent = "Failed to register service worker.";
			errorCode.textContent = err.toString();
			throw err;
		}
		const url = search(address.value, searchEngine.value);
		const frame = document.getElementById("uv-frame");
		frame.style.display = "block";
		const wispUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/wisp/`;
		if ((await connection.getTransport()) !== "/epoxy/index.mjs") {
			await connection.setTransport("/epoxy/index.mjs", [{ wisp: wispUrl }]);
		}
		frame.src = __uv$config.prefix + __uv$config.encodeUrl(url);
	});
}

initApp();
