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
mkdir -p "${profile}/extensions"
for extension_id in setup-bridge@scholarserver.com zotmoov@wileyy.com; do
  cp "/opt/zotero/distribution/extensions/${extension_id}.xpi" "${profile}/extensions/${extension_id}.xpi"
done

# Zotero treats extensions copied into an existing profile as foreign sideloads
# and disables them unless the profile opts into managed extensions. Both
# ScholarServer's setup bridge and ZotMoov are part of this managed image, so
# keep only those two known IDs enabled without changing any user-installed
# plugins.
cat > "${profile}/user.js" <<'EOF'
user_pref("extensions.autoDisableScopes", 0);
user_pref("extensions.enabledScopes", 15);
EOF

extensions_registry="${profile}/extensions.json"
if [[ -f "${extensions_registry}" ]]; then
  python3 - "${extensions_registry}" "${profile}/addonStartup.json.lz4" <<'PY'
import json
import os
import sys
import tempfile

registry_path, startup_cache_path = sys.argv[1:]
managed_ids = {"setup-bridge@scholarserver.com", "zotmoov@wileyy.com"}

with open(registry_path, encoding="utf-8") as source:
    registry = json.load(source)

changed = False
for addon in registry.get("addons", []):
    if addon.get("id") not in managed_ids:
        continue
    desired = {
        "active": True,
        "seen": True,
        "softDisabled": False,
        "userDisabled": False,
    }
    for key, value in desired.items():
        if addon.get(key) != value:
            addon[key] = value
            changed = True

if changed:
    descriptor, temporary_path = tempfile.mkstemp(
        prefix="extensions.", suffix=".json", dir=os.path.dirname(registry_path)
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as destination:
            json.dump(registry, destination, separators=(",", ":"))
            destination.flush()
            os.fsync(destination.fileno())
        os.replace(temporary_path, registry_path)
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)
    try:
        os.unlink(startup_cache_path)
    except FileNotFoundError:
        pass
PY
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
