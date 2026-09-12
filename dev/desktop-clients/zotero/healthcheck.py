"""Check the local noVNC asset server and its loopback-only VNC backend."""

import socket
import sys
import urllib.request


def main():
    try:
        with urllib.request.urlopen("http://127.0.0.1:6080/vnc.html", timeout=2) as response:
            if response.status != 200:
                return 1
        with socket.create_connection(("127.0.0.1", 5901), timeout=2) as connection:
            with connection.makefile("rb") as stream:
                if not stream.read(12).startswith(b"RFB "):
                    return 1
    except (OSError, ValueError):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
