"""Qualify joining a disposable existing database through verified HTTPS.

Called by the native multi-vault test. The source database is populated by an
independent encrypted protocol peer before ScholarServer imports its setup URI.
"""
import json
import os
import subprocess
import uuid


def prepare_tls(root):
    directory = root / "tls"
    directory.mkdir(mode=0o700)
    subprocess.run([
        "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
        "-keyout", str(directory / "key.pem"), "-out", str(directory / "cert.pem"),
        "-subj", "/CN=remote.livesync.test", "-addext", "subjectAltName=DNS:remote.livesync.test",
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    (directory / "proxy.mjs").write_text('''
import https from "node:https";
import http from "node:http";
import { readFileSync, appendFileSync } from "node:fs";
https.createServer({key:readFileSync("/tls/key.pem"),cert:readFileSync("/tls/cert.pem")},(request,response)=>{
  appendFileSync("/tls/requests.jsonl",JSON.stringify({method:request.method,path:request.url})+"\\n");
  const remote=http.request({hostname:"livesync-couchdb",port:5984,path:request.url,method:request.method,headers:request.headers},reply=>{
    response.writeHead(reply.statusCode,reply.headers); reply.pipe(response);
  });
  remote.on("error",()=>{response.writeHead(502);response.end();});
  request.pipe(remote);
}).listen(8443,"0.0.0.0");
''')
    for filename in directory.iterdir():
        os.chown(filename, 1000, 1000)
        filename.chmod(0o600)
    os.chown(directory, 1000, 1000)


def qualify(root, start, controller, worker, images, probe, request, save, docker, wait_for):
    start("remote", [("tls", "/tls")], ["--entrypoint", "node", "--network-alias", "remote.livesync.test"],
          image=images["sync"], command=["/tls/proxy.mjs"])
    for name in ["import-peer-db", "import-peer-vault"]:
        directory = root / name
        directory.mkdir(mode=0o700)
        os.chown(directory, 1000, 1000)
    peer = start("import-peer", [("import-peer-db", "/livesync-db"), ("import-peer-vault", "/vault"),
                                 ("tls", "/tls:ro")],
                 ["--entrypoint", "node", "-e", "NODE_EXTRA_CA_CERTS=/tls/cert.pem"],
                 image=images["worker"], command=["-e", "setInterval(()=>{},1000)"])
    # Provisioning belongs to the disposable source fixture, not the importer.
    probe(controller, '''
      import {readFile,writeFile} from 'node:fs/promises';
      import {provisionCouchDb,generateSetupUri} from './sync/livesync-setup.mjs';
      const env=await readFile('/livesync-runtime/livesync-couchdb.env','utf8');
      const administrator={username:env.match(/^COUCHDB_USER=(.+)$/m)[1],password:env.match(/^COUCHDB_PASSWORD=(.+)$/m)[1]};
      const credentials={database:'existing_import',clientUsername:'existing-import',clientPassword:'Synthetic-member-test-only-2026-0123456789'};
      await provisionCouchDb({internalUrl:'http://livesync-couchdb:5984',...administrator,...credentials});
      const setup=await generateSetupUri({url:'https://remote.livesync.test:8443',username:credentials.clientUsername,
        password:credentials.clientPassword,database:credentials.database,vaultPassphrase:'Synthetic-encryption-test-only-2026',
        setupPassphrase:'Synthetic-setup-test-only-2026'});
      await writeFile('/tls/import.json',JSON.stringify(setup),{mode:0o600});
    ''')
    probe(peer, '''
      import {readFile,mkdir} from 'node:fs/promises'; import {spawn} from 'node:child_process';
      const setup=JSON.parse(await readFile('/tls/import.json','utf8'));
      await mkdir('/livesync-db/.livesync',{recursive:true});
      await new Promise((resolve,reject)=>{
        const child=spawn('node',['/app/dist/index.cjs','/livesync-db','--settings','/livesync-db/.livesync/settings.json','setup',setup.setupURI],{stdio:['pipe','ignore','ignore']});
        child.stdin.end(setup.setupPassphrase+'\\n');child.once('error',reject);
        child.once('exit',code=>code===0?resolve():reject(Error('Existing peer setup failed')));
      });
    ''')

    def peer_cli(*args, input=None):
        return docker("exec", "-i", peer, "node", "/app/dist/index.cjs", "/livesync-db", "--settings",
                      "/livesync-db/.livesync/settings.json", *args, input=input)

    peer_cli("put", "Existing.md", input="Synthetic encrypted note predating ScholarServer import")
    peer_cli("sync")
    peer_cli("unlock-remote")  # Only the source peer initializes its own test database.
    save("vaults", "add-vault", {"vaultId": "add-livesync-existing", "label": "Imported existing"})
    registry = json.loads((root / "runtime/vaults.json").read_text())
    vault_id = next(vault["id"] for vault in registry["vaults"] if vault["label"] == "Imported existing")
    setup = json.loads((root / "tls/import.json").read_text())
    values = {"vaultId": vault_id, "livesyncMode": "join", "scopePath": "/", "confirmedNoOtherSync": True,
              "setupURI": setup["setupURI"], "setupPassphrase": "Wrong-synthetic-setup-passphrase"}
    section = request(controller, "/api/configuration/vaults/evaluate", {"values": {"vaultId": vault_id}})
    assert section["values"]["livesyncMode"] == "join"
    request_id = str(uuid.uuid4())
    log = root / "tls/requests.jsonl"
    before = log.read_bytes()
    probe(controller, f'''
      import assert from 'node:assert/strict';
      const response=await fetch('http://127.0.0.1:8080/api/configuration/vaults/actions/join-livesync',{{
        method:'POST',headers:{{'content-type':'application/json'}},body:JSON.stringify({json.dumps({"requestId": request_id, "expectedRevision": section["revision"], "values": values})})}});
      assert.equal(response.status,400); const result=await response.json();
      assert.equal(result.status,'rejected-before-change');
    ''')
    assert log.read_bytes() == before, "Wrong setup passphrase must not contact or mutate the source database"
    assert not (root / "runtime/vaults" / vault_id / "vault-binding.json").exists()
    values["setupPassphrase"] = setup["setupPassphrase"]
    save("vaults", "join-livesync", values)
    enrollment = json.loads((root / "runtime/vaults" / vault_id / "enrollment.json").read_text())
    assert enrollment["joiningExisting"] is True and enrollment["database"] == "existing_import"
    config = json.loads((root / "live/vaults" / vault_id / "livesync-worker.json").read_text())
    assert config["initializeAfterFirstDevice"] is False
    vault = root / "vaults" / vault_id
    wait_for("Imported encrypted source note arrives without resetting the database", lambda: (vault / "Existing.md").exists(), 120)
    assert (vault / "Existing.md").read_text() == "Synthetic encrypted note predating ScholarServer import"
    (vault / "Imported-server.md").write_text("Synthetic note from the imported server connection")
    os.chown(vault / "Imported-server.md", 1000, 1000)

    def server_note_arrives():
        peer_cli("sync")
        peer_cli("mirror", "/vault")
        return (root / "import-peer-vault/Imported-server.md").exists()

    wait_for("Imported server note reaches its original encrypted peer", server_note_arrives, 120)
    assert (root / "import-peer-vault/Imported-server.md").read_text() == "Synthetic note from the imported server connection"
    docker("restart", controller, worker)
    peer_cli("put", "After-import-restart.md", input="Synthetic existing peer note after server restart")
    peer_cli("sync")
    wait_for("Imported connection resumes after supervisor and sync worker restart", lambda: (vault / "After-import-restart.md").exists(), 120)
    assert (vault / "After-import-restart.md").read_text() == "Synthetic existing peer note after server restart"
    requests = [json.loads(line) for line in log.read_text().splitlines() if line]
    forbidden = [item for item in requests if item["method"] == "DELETE" and item["path"] == "/existing_import"
                 or item["method"] == "PUT" and item["path"] in ["/existing_import", "/existing_import/_security"]]
    assert not forbidden, "Import must never recreate, delete or reconfigure the source database"
    save("vaults", "save-access", {"vaultId": vault_id, "label": "Imported existing", "aiEnabled": False})
    print("PASS: existing LiveSync HTTPS import, wrong-password refusal and retry, preserved encrypted note, bidirectional peer replication and restart", flush=True)
