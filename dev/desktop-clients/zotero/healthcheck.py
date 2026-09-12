"""Check the local noVNC asset server and its loopback-only VNC backend."""

import socket
import struct
import sys
import time
import urllib.request


def read_exact(connection, size, deadline):
    data = bytearray()
    while len(data) < size:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("VNC handshake timed out")
        connection.settimeout(remaining)
        chunk = connection.recv(size - len(data))
        if not chunk:
            raise ValueError("Incomplete VNC handshake")
        data.extend(chunk)
    return bytes(data)


def complete_handshake(connection, deadline):
    # This image's TigerVNC serves RFB 3.8. Its blacklist rejection instead
    # starts with an RFB 3.3 banner, so merely checking the prefix is not enough.
    version = read_exact(connection, 12, deadline)
    if version != b"RFB 003.008\n":
        raise ValueError("Unexpected VNC protocol or rejected connection")
    connection.sendall(version)
    security_count = read_exact(connection, 1, deadline)[0]
    if security_count == 0:
        raise ValueError("VNC connection rejected")
    security_types = read_exact(connection, security_count, deadline)
    if 1 not in security_types:
        raise ValueError("Expected loopback VNC security type is unavailable")
    connection.sendall(b"\x01")
    if read_exact(connection, 4, deadline) != b"\x00\x00\x00\x00":
        raise ValueError("VNC security negotiation failed")

    # Finish authentication and initialization, without displacing viewers or
    # requesting pixels, clipboard data, keyboard events or pointer events.
    connection.sendall(b"\x01")  # ClientInit: shared session
    server_init = read_exact(connection, 24, deadline)
    width, height = struct.unpack("!HH", server_init[:4])
    name_length = struct.unpack("!I", server_init[20:24])[0]
    if not width or not height or name_length > 4096:
        raise ValueError("Invalid VNC desktop initialization")
    read_exact(connection, name_length, deadline)


def main():
    try:
        with urllib.request.urlopen("http://127.0.0.1:6080/vnc.html", timeout=2) as response:
            if response.status != 200:
                return 1
        deadline = time.monotonic() + 2
        with socket.create_connection(("127.0.0.1", 5901), timeout=2) as connection:
            complete_handshake(connection, deadline)
    except (OSError, ValueError):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
