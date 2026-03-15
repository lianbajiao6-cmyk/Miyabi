import { join } from "node:path";
import { hostname } from "node:os";
import { createServer } from "node:http";
import { readFile, writeFile, access } from "node:fs/promises";
import express from "express";
import wisp from "wisp-server-node";

import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const dataFile = join(process.cwd(), "public", "data.json");

const app = express();
app.use(express.json());
app.set("trust proxy", true);

async function readDataJson() {
	try {
		await access(dataFile);
	} catch {
		await writeFile(dataFile, JSON.stringify({ records: {} }, null, 2), "utf8");
	}
	const raw = await readFile(dataFile, "utf8");
	try {
		return JSON.parse(raw);
	} catch {
		return { records: {} };
	}
}

async function writeDataJson(data) {
	await writeFile(dataFile, JSON.stringify(data, null, 2), "utf8");
}

app.get("/api/ip", (req, res) => {
	const ip = req.ip || req.socket.remoteAddress || "unknown";
	res.json({ ip });
});

app.get("/api/records", async (req, res) => {
	const data = await readDataJson();
	res.json(data.records || {});
});

app.post("/api/create", async (req, res) => {
	const { pin } = req.body;
	if (!pin || !/^\d{4}$/.test(pin)) {
		res.status(400).json({ error: "Invalid pin" });
		return;
	}
	const data = await readDataJson();
	if (!data.records) data.records = {};
	data.records[pin] = { pin, ip: null, created: Date.now() };
	await writeDataJson(data);
	res.json({ pin });
});

app.post("/api/verify", async (req, res) => {
	const { pin, ip } = req.body;
	if (!pin || !ip) {
		res.status(400).json({ valid: false, error: "Missing pin or ip" });
		return;
	}
	const data = await readDataJson();
	const rec = data.records?.[pin];
	if (!rec) {
		res.status(404).json({ valid: false, error: "Passcode not found" });
		return;
	}
	const now = Date.now();
	if (!rec.created || now - rec.created > 7 * 24 * 60 * 60 * 1000) {
		delete data.records[pin];
		await writeDataJson(data);
		res.status(403).json({ valid: false, error: "Expired" });
		return;
	}
	if (!rec.ip) {
		rec.ip = ip;
		await writeDataJson(data);
	}
	if (rec.ip !== ip) {
		res.status(403).json({ valid: false, error: "IP mismatch" });
		return;
	}
	res.json({ valid: true });
});

app.post("/api/reset", async (req, res) => {
	await writeDataJson({ records: {} });
	res.json({ ok: true });
});

// Load our publicPath first and prioritize it over UV.
app.use(express.static("./public"));
// Load vendor files last.
// The vendor's uv.config.js won't conflict with our uv.config.js inside the publicPath directory.
app.use("/uv/", express.static(uvPath));
app.use("/epoxy/", express.static(epoxyPath));
app.use("/baremux/", express.static(baremuxPath));

// Error for everything else
app.use((req, res) => {
	res.status(404);
	res.sendFile(join(process.cwd(), "public", "404.html"));
});

const server = createServer();

server.on("request", (req, res) => {
	res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
	res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
	app(req, res);
});
server.on("upgrade", (req, socket, head) => {
	if (req.url.endsWith("/wisp/")) {
		wisp.routeRequest(req, socket, head);
		return;
	} 
	socket.end();
});

let port = parseInt(process.env.PORT || "");

if (isNaN(port)) port = 8080;

server.on("listening", () => {
	const address = server.address();

	// by default we are listening on 0.0.0.0 (every interface)
	// we just need to list a few
	console.log("Listening on:");
	console.log(`\thttp://localhost:${address.port}`);
	console.log(`\thttp://${hostname()}:${address.port}`);
	console.log(
		`\thttp://${
			address.family === "IPv6" ? `[${address.address}]` : address.address
		}:${address.port}`
	);
});

// https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
	console.log("SIGTERM signal received: closing HTTP server");
	server.close();
	process.exit(0);
}

server.listen({
	port,
});
