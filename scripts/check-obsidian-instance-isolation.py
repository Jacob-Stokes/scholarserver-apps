"""Native startup regression with two isolated vaults and a conflicting edge alias.

Pass the sync image to test. Uses only UUID-named disposable Docker resources.
No host directories, account credentials or existing vaults are mounted.
"""
import json
import subprocess
import sys
import time
import uuid


def docker(*arguments):
    return subprocess.check_output(["docker", *arguments], text=True).strip()


def main():
    image = sys.argv[1]
    prefix = "ss-obsidian-isolation-" + uuid.uuid4().hex[:10]
    networks, volumes, containers = [], [], []
    controllers = []
    try:
        edge = prefix + "-edge"
        docker("network", "create", edge)
        networks.append(edge)
        for instance in ("first", "second"):
            network = prefix + "-" + instance
            docker("network", "create", "--internal", network)
            networks.append(network)
            mounts = []
            for label, target, uid in (("vault", "/vault", 1000), ("runtime", "/runtime", 1000),
                                       ("live", "/livesync-runtime", 1000), ("couch", "/opt/couchdb/data", 5984)):
                volume = network + "-" + label
                docker("volume", "create", volume)
                volumes.append(volume)
                initializer = volume + "-init"
                containers.append(initializer)
                docker("run", "--name", initializer, "--network", "none", "--user", "0:0",
                       "--mount", f"type=volume,src={volume},dst=/initialize", "--entrypoint", "node", image,
                       "-e", f"const fs=require('node:fs');fs.chownSync('/initialize',{uid},{uid});fs.chmodSync('/initialize',0o755)")
                mounts.append((volume, target))
            couch = network + "-couch"
            containers.append(couch)
            docker("run", "-d", "--name", couch, "--network", network,
                   "--network-alias", f"obsidian-db-test-{instance}", "--network-alias", "livesync-couchdb",
                   "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
                   "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=32m",
                   "--tmpfs", "/opt/couchdb/etc/local.d:rw,noexec,nosuid,nodev,size=4m,uid=5984,gid=5984,mode=0700",
                   "-v", f"{mounts[2][0]}:/livesync-runtime:ro", "-v", f"{mounts[3][0]}:/opt/couchdb/data",
                   "scholarserver-packaging-review:couchdb")
            if instance == "first":
                docker("network", "connect", "--alias", "livesync-couchdb", edge, couch)
            controller = network + "-sync"
            containers.append(controller)
            args = ["create", "--name", controller, "--network", network, "--read-only", "--cap-drop", "ALL",
                    "--security-opt", "no-new-privileges:true", "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=32m",
                    "-e", "SCHOLARSERVER_VARIANT=self-hosted-livesync", "-e", "SCHOLARSERVER_WORKSPACE_ID=test",
                    "-e", f"SCHOLARSERVER_INSTANCE_ID={instance}"]
            for volume, target in mounts[:3]:
                args.extend(["-v", f"{volume}:{target}"])
            docker(*args, image)
            docker("network", "connect", edge, controller)
            docker("start", controller)
            controllers.append(controller)

        def verify(controller):
            code = """const assert=require('node:assert/strict');
              fetch('http://127.0.0.1:8080/api/status').then(r=>r.json()).then(s=>{
                assert.equal(s.profile,'livesync');assert.equal(s.state,'setup-required');
              }).catch(()=>process.exit(1));"""
            deadline = time.monotonic() + 120
            while time.monotonic() < deadline:
                result = subprocess.run(["docker", "exec", controller, "node", "-e", code], capture_output=True)
                if result.returncode == 0:
                    return
                time.sleep(1)
            raise AssertionError("Controller did not reach isolated setup: " + controller)

        for controller in controllers:
            verify(controller)
            docker("restart", controller)
            verify(controller)
        print(json.dumps({"twoInstanceStartup": True, "conflictingEdgeAlias": True, "restart": True}))
    finally:
        for name in reversed(containers):
            subprocess.run(["docker", "rm", "-f", name], check=True, stdout=subprocess.DEVNULL)
        for name in reversed(networks):
            docker("network", "rm", name)
        for name in reversed(volumes):
            docker("volume", "rm", name)


if __name__ == "__main__":
    main()
