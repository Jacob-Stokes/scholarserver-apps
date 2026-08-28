#!/usr/bin/env bash
set -euo pipefail

umask 077

mkdir -p "${HOME}" "${HOME}/.vnc" /data /tmp/.X11-unix

profile_root="${HOME}/.zotero/zotero"
profile="${profile_root}/scholarserver.default"
mkdir -p "${profile_root}"
if [[ ! -d "${profile}" && -f "${profile_root}/profiles.ini" ]]; then
  previous_relative="$(awk -F= '/^Path=/{print $2; exit}' "${profile_root}/profiles.ini")"
  case "${previous_relative}" in
    ""|/*|*..*) ;;
    *)
      previous_profile="${profile_root}/${previous_relative}"
      if [[ -d "${previous_profile}" && "${previous_profile}" != "${profile}" ]]; then
        mv "${previous_profile}" "${profile}"
      fi
      ;;
  esac
fi
mkdir -p "${profile}"
profile_plugin="${profile}/extensions/setup-bridge@scholarserver.com.xpi"
bundled_plugin="/opt/zotero/distribution/extensions/setup-bridge@scholarserver.com.xpi"
if [[ -f "${profile_plugin}" ]]; then
  cp "${bundled_plugin}" "${profile_plugin}"
fi

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

if [[ "${SCHOLARSERVER_ZOTERO_DEBUG:-}" == "1" ]]; then
  dbus-run-session -- sh -c 'openbox-session & exec /opt/zotero/zotero --no-remote -profile "$1" -ZoteroDebugText' sh "${profile}" &
else
  dbus-run-session -- sh -c 'openbox-session & exec /opt/zotero/zotero --no-remote -profile "$1"' sh "${profile}" &
fi
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
