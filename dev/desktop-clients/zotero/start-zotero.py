"""Supervise an isolated desktop without configuring Zotero's stock profile."""

import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time


class Desktop:
    def __init__(self):
        self.processes = []
        self.stopping = False

    def request_stop(self, _signum, _frame):
        self.stopping = True

    def start(self, name, command):
        process = subprocess.Popen(command, start_new_session=True)
        self.processes.append((name, process))
        return process

    def wait_for_display(self, server):
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if self.stopping:
                return False
            if server.poll() is not None:
                raise RuntimeError("VNC display exited before becoming ready")
            try:
                result = subprocess.run(
                    ["xdpyinfo"], stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL, timeout=2, check=False,
                )
            except subprocess.TimeoutExpired:
                continue
            if result.returncode == 0:
                return True
            time.sleep(0.2)
        raise RuntimeError("VNC display did not become ready within 20 seconds")

    def stop(self):
        # Each service owns a process group, including D-Bus and Zotero children.
        for _name, process in reversed(self.processes):
            self.signal_group(process, signal.SIGTERM)
        deadline = time.monotonic() + 8
        for _name, process in reversed(self.processes):
            try:
                process.wait(timeout=max(0, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                pass
        for _name, process in reversed(self.processes):
            self.signal_group(process, signal.SIGKILL)
            process.wait()

    @staticmethod
    def signal_group(process, signum):
        try:
            os.killpg(process.pid, signum)
        except ProcessLookupError:
            pass

    def run(self):
        geometry = os.environ.get("ZOTERO_DESKTOP_GEOMETRY", "1600x1000")
        if not re.fullmatch(r"[1-9][0-9]{2,3}x[1-9][0-9]{2,3}", geometry):
            raise RuntimeError("ZOTERO_DESKTOP_GEOMETRY must be WIDTHxHEIGHT (100–9999)")
        if os.getuid() != 10001 or os.environ.get("HOME") != "/config":
            raise RuntimeError("Run this image as UID 10001 with HOME=/config")
        if not os.access("/config", os.W_OK):
            raise RuntimeError("Mount a /config volume writable by UID 10001")
        os.umask(0o077)
        runtime = Path("/tmp/zotero-test-runtime")
        runtime.mkdir(mode=0o700, exist_ok=True)
        os.environ["XDG_RUNTIME_DIR"] = str(runtime)
        os.environ["DISPLAY"] = ":1"
        # A /tmp tmpfs hides the directory prepared by the image build.
        x11_directory = Path("/tmp/.X11-unix")
        if not x11_directory.exists():
            x11_directory.mkdir(mode=0o1777)
            x11_directory.chmod(0o1777)
        # Only this container's fixed display locks are disposable. Never change HOME.
        Path("/tmp/.X1-lock").unlink(missing_ok=True)
        Path("/tmp/.X11-unix/X1").unlink(missing_ok=True)
        server = self.start("VNC display", [
            "Xtigervnc", ":1", "-rfbport", "5901", "-SecurityTypes", "None",
            "-localhost=1", "-nolisten", "tcp", "-geometry", geometry,
            "-depth", "24", "-AlwaysShared",
        ])
        if not self.wait_for_display(server):
            return 0
        self.start("window manager", ["openbox"])
        # No -profile override, preferences, extensions, server bridge or data symlink.
        self.start("Zotero", ["dbus-run-session", "--", "/opt/zotero/zotero", "--no-remote"])
        self.start("noVNC", [
            "websockify", "--web=/usr/share/novnc", "0.0.0.0:6080", "127.0.0.1:5901",
        ])
        while not self.stopping:
            for name, process in self.processes:
                if process.poll() is not None:
                    raise RuntimeError(f"{name} exited with status {process.returncode}")
            time.sleep(0.2)
        return 0


def main():
    desktop = Desktop()
    signal.signal(signal.SIGTERM, desktop.request_stop)
    signal.signal(signal.SIGINT, desktop.request_stop)
    try:
        return desktop.run()
    except (OSError, RuntimeError) as error:
        print(f"Zotero test desktop: {error}", file=sys.stderr, flush=True)
        return 1
    finally:
        desktop.stop()


if __name__ == "__main__":
    sys.exit(main())
