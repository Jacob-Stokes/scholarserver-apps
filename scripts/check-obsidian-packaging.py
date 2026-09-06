"""Native Docker smoke test using only disposable data and container-local HTTP.

Expects locally built scholarserver-packaging-review:{obsidian-sync,obsidian-api,
obsidian-mcp}. No existing vaults, accounts, public routes or containers are used.
The official client is downloaded into a disposable user-owned volume, not an image.
"""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import uuid


def docker(*args, input=None):
    return subprocess.run(["docker", *args], input=input, text=True, check=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.strip()


def probe(container, code):
    return docker("exec", "-i", container, "node", "--input-type=module", "-", input=code)


def status(container):
    return json.loads(probe(container, "console.log(JSON.stringify(await (await fetch('http://127.0.0.1:8080/api/status')).json()))"))


def wait_for(description, check, timeout=90):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if check():
                print(description, flush=True)
                return
        except (subprocess.CalledProcessError, ValueError):
            pass
        time.sleep(1)
    raise AssertionError(f"Timed out: {description}")


def main():
    prefix = "ss-packaging-" + uuid.uuid4().hex[:10]
    root = Path(tempfile.mkdtemp(prefix=prefix))
    containers = []
    network_created = False
    try:
        for name in ["vault", "runtime", "live", "client", "config"]:
            directory = root / name
            directory.mkdir(mode=0o700)
            os.chown(directory, 1000, 1000)
        (root / "vault/Proof.md").write_text("# Synthetic vault\nOriginal note\n")
        os.chown(root / "vault/Proof.md", 1000, 1000)
        (root / "config/migration-proof").write_text("Synthetic account configuration sentinel")
        os.chown(root / "config/migration-proof", 1000, 1000)
        docker("network", "create", prefix)
        network_created = True

        def start(role, mounts, extra=(), image=None, command=()):
            name = f"{prefix}-{role}"
            args = ["run", "-d", "--name", name, "--network", prefix,
                    "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
                    "--memory", "768m", "--cpus", "1", "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=32m"]
            for source, target in mounts:
                args += ["--mount", f"type=bind,src={root / source},dst={target}"]
            args += list(extra) + [image or f"scholarserver-packaging-review:obsidian-{role}"] + list(command)
            docker(*args)
            containers.append(name)
            return name

        controller = start("sync", [("vault", "/vault"), ("runtime", "/runtime"), ("live", "/livesync-runtime"),
                                    ("client", "/official-client"), ("config", "/home/obsidian/.config")],
                           ["-e", "SCHOLARSERVER_VARIANT=obsidian-sync"])
        wait_for("Fresh official install waits for consent", lambda: status(controller)["state"] == "client-install-required")
        assert not (root / "client/installed").exists()
        assert docker("exec", controller, "id", "-u") == "1000"
        assert probe(controller, "console.log((await fetch('http://127.0.0.1:8080/api/client/install',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status)") == "400"
        assert probe(controller, "console.log((await fetch('http://127.0.0.1:8080/api/client/install',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed:true})})).status)") == "200"
        wait_for("Real npm download verified and activated without root", lambda: status(controller)["officialClient"]["phase"] == "installed", 150)
        output = docker("exec", "-i", controller, "node", "/app/official-command.mjs", input=json.dumps({
            "entrypoint": "/official-client/installed/package/cli.js", "args": ["--version"]
        }))
        assert output == "0.0.14", output
        before = (root / "client/installed/receipt.json").read_bytes()
        docker("restart", controller)
        wait_for("Restart preserves downloaded client without another install", lambda: status(controller)["officialClient"]["phase"] == "installed")
        assert (root / "client/installed/receipt.json").read_bytes() == before
        assert (root / "vault/Proof.md").read_text().endswith("Original note\n")
        assert (root / "config/migration-proof").read_text() == "Synthetic account configuration sentinel"

        # Old releases stored enrollment/config but had no downloaded-client
        # directory. Reproduce that data layout without using a real account.
        docker("stop", controller)
        shutil.rmtree(root / "client/installed")
        (root / "runtime/enrollment.json").write_text(json.dumps({
            "profile": "official", "remoteVault": "synthetic-legacy-vault", "scopePath": "/"
        }))
        os.chown(root / "runtime/enrollment.json", 1000, 1000)
        docker("start", controller)
        wait_for("Legacy enrollment waits for download confirmation", lambda: status(controller)["state"] == "client-install-required")
        assert status(controller)["remoteVault"] == "synthetic-legacy-vault"
        assert status(controller)["workerRunning"] is False
        assert (root / "config/migration-proof").read_text() == "Synthetic account configuration sentinel"
        assert (root / "vault/Proof.md").read_text().endswith("Original note\n")

        # API and MCP exercise the same vault with no dependency on sync binaries.
        api = start("api", [("vault", "/vault"), ("runtime", "/runtime")], ["--network-alias", "api"])
        mcp = start("mcp", [("runtime", "/runtime")])
        wait_for("Vault API healthy", lambda: probe(api, "console.log((await fetch('http://127.0.0.1:3000/health')).status)") == "200")
        wait_for("MCP healthy", lambda: probe(mcp, "console.log((await fetch('http://127.0.0.1:7002/health')).status)") == "200")
        result = probe(mcp, """
          import assert from 'node:assert/strict';
          import {readFile} from 'node:fs/promises';
          import {Client} from '@modelcontextprotocol/sdk/client/index.js';
          import {SSEClientTransport} from '@modelcontextprotocol/sdk/client/sse.js';
          const token=(await readFile('/runtime/service-token','utf8')).trim();
          const headers={Authorization:'Bearer '+token};
          const client=new Client({name:'packaging-proof',version:'1'});
          const transport=new SSEClientTransport(new URL('http://127.0.0.1:7002/sse'),{
            requestInit:{headers},eventSourceInit:{fetch:(url,init)=>fetch(url,{...init,headers:{...init?.headers,...headers}})}
          });
          await client.connect(transport);
          const tools=await client.listTools();
          assert(tools.tools.length>0);
          assert(tools.tools.some(t=>t.name==='obsidian_write_note'));
          const written=await client.callTool({name:'obsidian_write_note',arguments:{path:'MCP-proof.md',content:'# Synthetic MCP note',mode:'create'}});
          assert(!written.isError, JSON.stringify(written));
          const edited=await client.callTool({name:'obsidian_append_to_note',arguments:{path:'MCP-proof.md',content:'Edited through MCP'}});
          assert(!edited.isError, JSON.stringify(edited));
          const read=await client.callTool({name:'obsidian_get_note',arguments:{path:'MCP-proof.md'}});
          assert(!read.isError);
          assert(JSON.stringify(read).includes('Edited through MCP'));
          console.log('MCP write, edit and read passed');
          await client.close();
        """)
        print(result, flush=True)
        assert "Edited through MCP" in (root / "vault/MCP-proof.md").read_text()
        print("PASS: fresh download, integrity, non-root CLI, restart, data/config preservation and MCP connection", flush=True)

        # A second independent LiveSync CLI represents another protocol peer;
        # this is real replication, not a claim of Obsidian desktop-plugin QA.
        docker("rm", "-f", controller)
        containers.remove(controller)
        (root / "runtime/enrollment.json").unlink()
        shutil.rmtree(root / "client")
        (root / "client").mkdir(mode=0o700)
        os.chown(root / "client", 1000, 1000)
        os.chmod(root / "live", 0o755)
        for name, uid in [("couch", 5984), ("server-db", 1000), ("peer-db", 1000), ("peer-vault", 1000)]:
            (root / name).mkdir(mode=0o700)
            os.chown(root / name, uid, uid)
        start("couch", [("couch", "/opt/couchdb/data"), ("live", "/livesync-runtime")],
              ["--network-alias", "livesync-couchdb", "--tmpfs", "/opt/couchdb/etc/local.d:rw,noexec,nosuid,nodev,size=4m,uid=5984,gid=5984,mode=0700"],
              image="scholarserver-packaging-review:couchdb")
        controller = start("sync", [("vault", "/vault"), ("runtime", "/runtime"), ("live", "/livesync-runtime"),
                                    ("client", "/official-client"), ("config", "/home/obsidian/.config")],
                           ["-e", "SCHOLARSERVER_VARIANT=self-hosted-livesync"])
        worker = start("worker", [("vault", "/vault"), ("server-db", "/livesync-db"), ("live", "/livesync-runtime")],
                       image="scholarserver-packaging-review:livesync-worker")
        wait_for("LiveSync controller starts with Headless absent", lambda: status(controller)["profile"] == "livesync")
        assert status(controller)["officialClient"] is None
        assert probe(controller, "console.log((await fetch('http://127.0.0.1:8080/api/client/install',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed:true})})).status)") == "400"
        probe(controller, """
          import assert from 'node:assert/strict';
          const response=await fetch('http://127.0.0.1:8080/api/livesync/configure',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({confirmedNoOtherSync:true,accessMethod:'tailscale',connectionUrl:'https://synthetic.example.ts.net',vaultPassphrase:'Synthetic-vault-test-only-2026',scopePath:'/'})});
          assert.equal(response.status,200);
        """)
        peer = start("peer", [("peer-db", "/livesync-db"), ("peer-vault", "/vault"), ("live", "/livesync-runtime")],
                     ["--entrypoint", "node"], image="scholarserver-packaging-review:livesync-worker",
                     command=["-e", "setInterval(()=>{},1000)"])
        probe(peer, """
          import {readFile,mkdir} from 'node:fs/promises';
          import {spawn} from 'node:child_process';
          const setup=JSON.parse(await readFile('/livesync-runtime/livesync-worker.json','utf8'));
          await mkdir('/livesync-db/.livesync',{recursive:true});
          await new Promise((resolve,reject)=>{
            const child=spawn('node',['/app/dist/index.cjs','/livesync-db','--settings','/livesync-db/.livesync/settings.json','setup',setup.setupURI],{stdio:['pipe','ignore','ignore']});
            child.stdin.end(setup.setupPassphrase+'\\n');
            child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Peer setup failed')));
          });
        """)

        def peer_cli(*args, input=None):
            return docker("exec", "-i", peer, "node", "/app/dist/index.cjs", "/livesync-db",
                          "--settings", "/livesync-db/.livesync/settings.json", *args, input=input)

        peer_cli("put", "Device-proof.md", input="Synthetic note from independent LiveSync peer")
        peer_cli("sync")
        probe(controller, """
          import assert from 'node:assert/strict';
          const r=await fetch('http://127.0.0.1:8080/api/livesync/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmedPluginConnected:true})});
          assert.equal(r.status,200);
        """)
        wait_for("Independent LiveSync peer -> server vault replicated", lambda: (root / "vault/Device-proof.md").exists(), 120)
        assert "independent LiveSync peer" in (root / "vault/Device-proof.md").read_text()
        wait_for("Server LiveSync worker ready", lambda: status(controller)["state"] == "ready", 120)
        peer_cli("sync")
        peer_cli("mirror", "/vault")
        assert "Edited through MCP" in (root / "peer-vault/MCP-proof.md").read_text()
        docker("restart", worker)
        wait_for("LiveSync worker resumes after restart", lambda: status(controller)["liveSyncWorker"]["running"], 90)
        assert not (root / "client/installed").exists()
        print("PASS: two-peer LiveSync replication, MCP note replication and restart, with Headless absent", flush=True)
    finally:
        for name in reversed(containers):
            subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if network_created:
            subprocess.run(["docker", "network", "rm", prefix], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        shutil.rmtree(root)


if __name__ == "__main__":
    main()
