import { spawnSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bin = path.join(root, "vendor", "pgsql", "bin");
const dataDir = process.env.PGDATA_DIR || path.join(root, "vendor", "pgdata");
const port = process.env.PGPORT_LOCAL || "54329";
const superuserPass = "villageos";

function pg(args, opts = {}) {
  const r = spawnSync(path.join(bin, args[0] + ".exe"), args.slice(1), {
    env: { ...process.env, PGPASSWORD: superuserPass },
    encoding: "utf8",
    ...opts,
  });
  return r;
}

function waitForPort(port, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function tryConnect() {
      const sock = net.connect({ port, host: "127.0.0.1" });
      sock.once("connect", () => { sock.end(); resolve(); });
      sock.once("error", () => {
        if (Date.now() - start > timeoutMs) reject(new Error("postgres not reachable on " + port));
        else setTimeout(tryConnect, 500);
      });
    })();
  });
}

if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
  mkdirSync(dataDir, { recursive: true });
  const init = pg(["initdb", "-D", dataDir, "-U", "postgres", "-E", "UTF8", "-A", "scram-sha-256", `--pwfile=${makePwFile()}`]);
  if (init.status !== 0) { console.error(init.stderr || init.stdout); process.exit(1); }
}

const status = pg(["pg_ctl", "-D", dataDir, "status"]);
if (status.status !== 0) {
  mkdirSync(path.join(root, "vendor", "logs"), { recursive: true });
  const start = spawn(path.join(bin, "pg_ctl.exe"),
    ["-D", dataDir, "-l", path.join(root, "vendor", "logs", "postgres.log"), "-o", `-p ${port} -c listen_addresses=127.0.0.1`, "start"],
    { stdio: "ignore" });
  start.unref();
  await waitForPort(port);
}

console.log(JSON.stringify({ ok: true, port, dataDir }));

function makePwFile() {
  const f = path.join(dataDir, "..", "pwfile.tmp");
  writeFileSync(f, superuserPass + "\n");
  return f;
}
