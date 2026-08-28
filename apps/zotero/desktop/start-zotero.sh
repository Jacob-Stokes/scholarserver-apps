#!/usr/bin/env bash
set -euo pipefail

umask 077

mkdir -p "${HOME}" "${HOME}/.vnc" /data /tmp/.X11-unix

if [[ ! -e "${HOME}/Zotero" ]]; then
  ln -s /data "${HOME}/Zotero"
fi

if [[ "$(readlink -f "${HOME}/Zotero")" != /data ]]; then
  echo "Zotero data directory must resolve to /data" >&2
  exit 1
fi

rm -f /tmp/.X1-lock /tmp/.X11-unix/X1

Xtigervnc :1 \
  -rfbport 5901 \
  -SecurityTypes None \
  -localhost=1 \
  -geometry "${ZOTERO_DESKTOP_GEOMETRY:-1600x1000}" \
  -depth 24 \
  -AlwaysShared \
  -AcceptKeyEvents \
  -AcceptPointerEvents &
x_pid=$!

dbus-run-session -- sh -c 'openbox-session & exec /opt/zotero/zotero --no-remote' &
zotero_pid=$!

websockify --web=/usr/share/novnc 0.0.0.0:3000 localhost:5901 &
web_pid=$!

terminate() {
  kill "${web_pid}" "${zotero_pid}" "${x_pid}" 2>/dev/null || true
  wait "${web_pid}" "${zotero_pid}" "${x_pid}" 2>/dev/null || true
}

trap terminate EXIT INT TERM

while kill -0 "${web_pid}" 2>/dev/null \
  && kill -0 "${zotero_pid}" 2>/dev/null \
  && kill -0 "${x_pid}" 2>/dev/null; do
  sleep 2
done

echo "A required Zotero desktop process stopped" >&2
exit 1
