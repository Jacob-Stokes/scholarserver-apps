"""Native shared-stack acceptance using only owned disposable Docker data.

Two real encrypted LiveSync protocol peers qualify replication and restart.
Two unconnected official slots qualify shared-client consent and separate HOME
storage, not paid-account authentication or official device sync.
"""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import uuid

support_spec = importlib.util.spec_from_file_location("obsidian_native_support", Path(__file__).with_name("check-obsidian-packaging.py"))
support = importlib.util.module_from_spec(support_spec)
support_spec.loader.exec_module(support)
docker, probe, wait_for = support.docker, support.probe, support.wait_for


def request(container, pathname, body=None):
    options = {"method": "GET"} if body is None else {"method": "POST", "headers": {"content-type": "application/json"}, "body": json.dumps(body)}
    result = probe(container, f"""
      const response=await fetch('http://127.0.0.1:8080'+{json.dumps(pathname)},{json.dumps(options)});
      console.log(JSON.stringify({{status:response.status,body:await response.json()}}));
    """)
    response = json.loads(result)
    assert response["status"] == 200, f"Native configuration request failed: {pathname} ({response['status']})"
    return response["body"]


def main():
    images = {role: os.environ.get(f"SCHOLARSERVER_OBSIDIAN_{variable}_IMAGE", f"scholarserver-packaging-review:{tag}") for role, variable, tag in [
        ("sync", "SYNC", "obsidian-sync"), ("api", "API", "obsidian-api"), ("mcp", "MCP", "obsidian-mcp"),
        ("couchdb", "COUCHDB", "couchdb"), ("worker", "WORKER", "livesync-worker")
    ]}
    prefix = "ss-multivault-" + uuid.uuid4().hex[:10]
    root = Path(tempfile.mkdtemp(prefix=prefix))
    containers = []
    network_created = False
    try:
        for name in ["vault", "vaults", "runtime", "live", "client", "config", "database", "peer-one-db", "peer-one-vault", "peer-two-db", "peer-two-vault", "couch"]:
            directory = root / name
            directory.mkdir(mode=0o755 if name == "live" else 0o700)
            uid = 5984 if name == "couch" else 1000
            os.chown(directory, uid, uid)
        docker("network", "create", prefix)
        network_created = True

        def start(role, mounts, extra=(), image=None, command=()):
            name = f"{prefix}-{role}"
            args = ["run", "-d", "--name", name, "--network", prefix, "--read-only", "--cap-drop", "ALL",
                    "--security-opt", "no-new-privileges:true", "--memory", "1g", "--cpus", "1",
                    "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=32m"]
            for source, target in mounts:
                readonly = target.endswith(":ro")
                destination = target[:-3] if readonly else target
                mount = f"type=bind,src={root / source},dst={destination}"
                if readonly:
                    mount += ",readonly"
                args += ["--mount", mount]
            args += list(extra) + [image or images[role]] + list(command)
            containers.append(name)
            docker(*args)
            return name

        controller = start("sync", [("vault", "/vault"), ("vaults", "/vaults"), ("runtime", "/runtime"),
                                    ("live", "/livesync-runtime"), ("client", "/official-client"), ("config", "/home/obsidian/.config")])
        wait_for("Empty registry starts without an official client", lambda: request(controller, "/health")["status"] == "ok")
        assert not (root / "client/installed").exists()
        start("couch", [("couch", "/opt/couchdb/data"), ("live", "/livesync-runtime")],
              ["--network-alias", "livesync-couchdb", "--tmpfs", "/opt/couchdb/etc/local.d:rw,noexec,nosuid,nodev,size=4m,uid=5984,gid=5984,mode=0700"], image=images["couchdb"])
        worker = start("worker", [("vault", "/vault"), ("vaults", "/vaults"), ("runtime", "/runtime:ro"),
                                  ("live", "/livesync-runtime"), ("database", "/livesync-db")])
        api = start("api", [("vault", "/vault"), ("vaults", "/vaults"), ("runtime", "/runtime:ro")], ["--network-alias", "api"])
        mcp = start("mcp", [("runtime", "/runtime:ro")])

        def save(section_id, action_id, values):
            section = request(controller, f"/api/configuration/{section_id}/evaluate", {"values": values})
            result = request(controller, f"/api/configuration/{section_id}/actions/{action_id}", {
                "requestId": str(uuid.uuid4()), "expectedRevision": section["revision"], "values": values
            })
            assert result["status"] == "succeeded", f"Native action did not complete: {action_id}"

        def add(label, source):
            save("vaults", "add-vault", {"label": label, "source": source})
            registry = json.loads((root / "runtime/vaults.json").read_text())
            return next(vault["id"] for vault in registry["vaults"] if vault["label"] == label)

        official_one = add("Official research", "official")
        official_two = add("Official notes", "official")
        def official_step(vault):
            return request(controller, "/api/configuration/setup/evaluate", {"values": {"vaultId": vault}})
        wait_for("Both official connections wait for consent", lambda: all(official_step(vault).get("stage", {}).get("id") == "client" for vault in [official_one, official_two]))
        assert not (root / "client/installed").exists()
        save("setup", "install-client", {"vaultId": official_one, "confirmed": True})
        # The action confirms that the consented background download was started.
        # Completion belongs to persisted client state, not the request receipt.
        wait_for("Shared official client download and integrity checks finish", lambda: official_step(official_one).get("stage", {}).get("id") == "account", 180)
        receipt = (root / "client/installed/receipt.json").read_bytes()
        wait_for("Second official connection reuses the verified shared client", lambda: official_step(official_two).get("stage", {}).get("id") == "account")
        assert (root / "client/installed/receipt.json").read_bytes() == receipt
        assert (root / "config/vaults" / official_one / ".config").is_dir()
        assert (root / "config/vaults" / official_two / ".config").is_dir()

        live_ids = [add("Live research", "livesync"), add("Live notes", "livesync")]
        peers = []
        for index, vault_id in enumerate(live_ids):
            wait_for("LiveSync connection starts independently", lambda vault=vault_id: official_step(vault).get("stage", {}).get("id") == "livesync")
            save("setup", "configure-livesync", {"vaultId": vault_id, "confirmedNoOtherSync": True,
                "accessMethod": "tailscale", "connectionUrl": "https://synthetic.example.ts.net",
                "vaultPassphrase": "Synthetic-vault-test-only-2026", "vaultPassphraseAgain": "Synthetic-vault-test-only-2026", "scopePath": "/"})
            selected = official_step(vault_id)
            output = next(item for item in selected["outputs"] if item["id"].startswith("setup-uri-"))
            disclosed = request(controller, f"/api/configuration/setup/outputs/{output['id']}", {"values": {"vaultId": vault_id}})
            assert disclosed["id"] == output["id"] and disclosed["value"]
            # Do not print the disposable setup credentials. A peer receives only
            # this connection's internal protocol setup, never CouchDB admin access.
            peer_name = "peer-one" if index == 0 else "peer-two"
            peer = start(peer_name, [(peer_name + "-db", "/livesync-db"), (peer_name + "-vault", "/vault"), ("live", "/livesync-runtime:ro")],
                         ["--entrypoint", "node"], image=images["worker"], command=["-e", "setInterval(()=>{},1000)"])
            probe(peer, f"""
              import {{readFile,mkdir}} from 'node:fs/promises'; import {{spawn}} from 'node:child_process';
              const setup=JSON.parse(await readFile('/livesync-runtime/vaults/{vault_id}/livesync-worker.json','utf8'));
              await mkdir('/livesync-db/.livesync',{{recursive:true}});
              await new Promise((resolve,reject)=>{{
                const child=spawn('node',['/app/dist/index.cjs','/livesync-db','--settings','/livesync-db/.livesync/settings.json','setup',setup.setupURI],{{stdio:['pipe','ignore','ignore']}});
                child.stdin.end(setup.setupPassphrase+'\\n'); child.once('error',reject);
                child.once('exit',code=>code===0?resolve():reject(Error('Isolated peer setup failed')));
              }});
            """)
            def peer_cli(*args, input=None, target=peer):
                return docker("exec", "-i", target, "node", "/app/dist/index.cjs", "/livesync-db", "--settings", "/livesync-db/.livesync/settings.json", *args, input=input)
            peer_cli("put", "Same.md", input=f"Synthetic device note {index}")
            peer_cli("sync")
            save("setup", "complete-livesync", {"vaultId": vault_id, "confirmedPluginConnected": True})
            wait_for("Encrypted peer note arrives in its selected vault", lambda vault=vault_id: (root / "vaults" / vault / "Same.md").exists(), 120)
            assert (root / "vaults" / vault_id / "Same.md").read_text() == f"Synthetic device note {index}"
            wait_for("LiveSync vault becomes ready", lambda vault=vault_id: official_step(vault).get("summary", []) and any(item["label"] == "Server sync" for item in official_step(vault)["summary"]), 120)
            peers.append((peer_cli, peer_name, peer))

        database_two = json.loads((root / "runtime/vaults" / live_ids[1] / "enrollment.json").read_text())["database"]
        probe(peers[0][2], f"""
          import assert from 'node:assert/strict'; import {{readFile}} from 'node:fs/promises';
          const settings=JSON.parse(await readFile('/livesync-db/.livesync/settings.json','utf8'));
          const authorization='Basic '+Buffer.from(settings.couchDB_USER+':'+settings.couchDB_PASSWORD).toString('base64');
          const response=await fetch('http://livesync-couchdb:5984/'+{json.dumps(database_two)}+'/_all_docs',{{headers:{{Authorization:authorization}}}});
          assert([401,403].includes(response.status),'A vault member must not read another vault database');
        """)

        wait_for("Single MCP server is healthy", lambda: probe(mcp, "console.log((await fetch('http://127.0.0.1:7002/health')).status)") == "200")
        ids = json.dumps(live_ids)
        result = probe(mcp, f"""
          import assert from 'node:assert/strict'; import {{readFile}} from 'node:fs/promises';
          import {{Client}} from '@modelcontextprotocol/sdk/client/index.js';
          import {{SSEClientTransport}} from '@modelcontextprotocol/sdk/client/sse.js';
          const token=(await readFile('/runtime/service-token','utf8')).trim(); const headers={{Authorization:'Bearer '+token}};
          const client=new Client({{name:'multi-vault-native-proof',version:'1'}});
          await client.connect(new SSEClientTransport(new URL('http://127.0.0.1:7002/sse'),{{requestInit:{{headers}},eventSourceInit:{{fetch:(url,init)=>fetch(url,{{...init,headers:{{...init?.headers,...headers}}}})}}}}));
          try {{
            const {{tools}}=await client.listTools(); assert.equal(tools.length,20); assert.equal(new Set(tools.map(tool=>tool.name)).size,20);
            for (const tool of tools.filter(tool=>tool.name!=='obsidian_list_vaults')) assert(tool.inputSchema.required.includes('vault_id'));
            const inventory=await client.callTool({{name:'obsidian_list_vaults',arguments:{{}}}}); assert(!inventory.isError);
            for (const [index,vault_id] of {ids}.entries()) {{
              assert(JSON.stringify(inventory).includes(vault_id));
              const read=await client.callTool({{name:'obsidian_get_note',arguments:{{vault_id,path:'Same.md'}}}});
              assert(!read.isError); assert(JSON.stringify(read).includes('Synthetic device note '+index));
              const written=await client.callTool({{name:'obsidian_write_note',arguments:{{vault_id,path:'Research/Server.md',content:'Synthetic server note '+index,mode:'create'}}}});
              assert(!written.isError);
              const bytes=Buffer.from([0,1,index,127,128,255]);
              const attachment=await client.callTool({{name:'obsidian_attachments',arguments:{{vault_id,action:'write',path:'Research/Server.bin',content_base64:bytes.toString('base64')}}}});
              assert(!attachment.isError);
              const readAttachment=await client.callTool({{name:'obsidian_attachments',arguments:{{vault_id,action:'read',path:'Research/Server.bin'}}}});
              assert(!readAttachment.isError); assert(JSON.stringify(readAttachment).includes(bytes.toString('base64')));
            }}
            const denied=await client.callTool({{name:'obsidian_get_note',arguments:{{vault_id:'missing',path:'Same.md'}}}}); assert(denied.isError);
            console.log('One tool inventory selects and isolates both native vaults');
          }} finally {{ await client.close(); }}
        """)
        print(result, flush=True)
        for index, (peer_cli, peer_name, _peer) in enumerate(peers):
            def uploaded():
                peer_cli("sync")
                peer_cli("mirror", "/vault")
                peer_root = root / (peer_name + "-vault")
                return (peer_root / "Research/Server.md").exists() and (peer_root / "Research/Server.bin").exists()
            wait_for("Server MCP note replicates to its own independent peer", uploaded, 120)
            assert (root / (peer_name + "-vault") / "Research/Server.md").read_text() == f"Synthetic server note {index}"
            assert (root / (peer_name + "-vault") / "Research/Server.bin").read_bytes() == bytes([0, 1, index, 127, 128, 255])

        save("setup", "save-scope", {"vaultId": live_ids[0], "scopePath": "Research"})
        save("access", "save-access", {"vaultId": live_ids[1], "label": "Live notes", "aiEnabled": False})
        probe(api, f"""
          import assert from 'node:assert/strict'; import {{readFile}} from 'node:fs/promises';
          const token=(await readFile('/runtime/service-token','utf8')).trim(); const id={json.dumps(live_ids[0])};
          const headers={{'x-api-key':token,'x-obsidian-vault-id':id,'x-obsidian-scope':'Research'}};
          assert.equal((await fetch('http://127.0.0.1:3000/files/Same.md',{{headers}})).status,400);
          assert.equal((await fetch('http://127.0.0.1:3000/files/Research/Server.md',{{headers}})).status,200);
          const inventory=await (await fetch('http://127.0.0.1:3000/vaults',{{headers}})).json();
          assert.deepEqual(inventory.vaults.map(vault=>vault.id),[id]);
        """)
        registry = (root / "runtime/vaults.json").read_bytes()
        token = (root / "runtime/service-token").read_bytes()
        docker("restart", controller)
        docker("restart", worker)
        wait_for("Both LiveSync controllers resume after shared-stack restart", lambda: all(any(item["label"] == "Server sync" and item["value"] == "Running" for item in official_step(vault).get("summary", [])) for vault in live_ids), 120)
        assert (root / "runtime/vaults.json").read_bytes() == registry
        assert (root / "runtime/service-token").read_bytes() == token
        assert (root / "client/installed/receipt.json").read_bytes() == receipt
        assert all((root / "vaults" / vault / "Same.md").exists() for vault in live_ids)
        for index, vault in enumerate(live_ids):
            assert (root / "vaults" / vault / "Research/Server.bin").read_bytes() == bytes([0, 1, index, 127, 128, 255])
        assert len([name for name in containers if name.endswith("-sync")]) == 1

        # Simulate the old single-vault layout only inside this owned fixture.
        # No retained installation is migrated by this test. The production entry
        # points must adopt an existing encrypted replica without re-enrollment.
        docker("stop", controller)
        docker("stop", worker)
        adopted = live_ids[0]
        def copy_owned_fixture(source, destination):
            shutil.copytree(source, destination, dirs_exist_ok=True)
            for directory, names, files in os.walk(destination):
                os.chown(directory, 1000, 1000)
                for name in names + files:
                    os.chown(Path(directory) / name, 1000, 1000)
        copy_owned_fixture(root / "vaults" / adopted, root / "vault")
        copy_owned_fixture(root / "runtime/vaults" / adopted, root / "runtime")
        copy_owned_fixture(root / "live/vaults" / adopted, root / "live")
        copy_owned_fixture(root / "database/vaults" / adopted, root / "database")
        admin_before = (root / "live/livesync-couchdb.env").read_bytes()
        enrollment_before = (root / "runtime/enrollment.json").read_bytes()
        binding_before = (root / "runtime/vault-binding.json").read_bytes()
        (root / "runtime/vaults.json").unlink()
        docker("start", controller)
        docker("start", worker)
        wait_for("Production entry points adopt the preserved legacy LiveSync connection", lambda: any(item["label"] == "Server sync" and item["value"] == "Running" for item in official_step("existing").get("summary", [])), 120)
        adopted_registry = json.loads((root / "runtime/vaults.json").read_text())
        assert [(vault["id"], vault["source"], vault["layout"]) for vault in adopted_registry["vaults"]] == [("existing", "livesync", "legacy")]
        assert (root / "live/livesync-couchdb.env").read_bytes() == admin_before
        assert (root / "runtime/enrollment.json").read_bytes() == enrollment_before
        assert (root / "runtime/vault-binding.json").read_bytes() == binding_before
        assert (root / "runtime/service-token").read_bytes() == token
        assert (root / "vault/Research/Server.bin").read_bytes() == bytes([0, 1, 0, 127, 128, 255])
        added_official = add("New official connection", "official")
        wait_for("Official connection can be added alongside the adopted LiveSync replica", lambda: official_step(added_official).get("stage", {}).get("id") == "account")
        peers[0][0]("put", "Research/After-adoption.md", input="Synthetic peer note after legacy adoption")
        peers[0][0]("sync")
        wait_for("Preserved encrypted peer still reaches the adopted legacy vault", lambda: (root / "vault/Research/After-adoption.md").exists(), 120)
        assert (root / "vault/Research/After-adoption.md").read_text() == "Synthetic peer note after legacy adoption"
        print("PASS: production legacy adoption preserves enrollment, binding, database administrator, service token and encrypted peer connectivity; a managed official connection can be added alongside", flush=True)
        print("PASS: one native stack, four connection slots, shared verified client, two encrypted LiveSync peers, one explicit MCP inventory, same-path isolation, encrypted binary attachment delivery, per-vault revocation/scope and restart", flush=True)
        print("LIMIT: official slots are not signed in; paid-account/device acceptance and retained migration are separate gates", flush=True)
    finally:
        cleanup_failures = []
        for name in reversed(containers):
            subprocess.run(["docker", "rm", "-fv", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            remaining = subprocess.run(["docker", "inspect", "--type", "container", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if remaining.returncode == 0:
                cleanup_failures.append(name)
        if network_created:
            subprocess.run(["docker", "network", "rm", prefix], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            remaining = subprocess.run(["docker", "network", "inspect", prefix], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if remaining.returncode == 0:
                cleanup_failures.append(prefix)
        if cleanup_failures:
            raise RuntimeError("Owned disposable test resources remain: " + ", ".join(cleanup_failures))
        shutil.rmtree(root)


if __name__ == "__main__":
    main()
