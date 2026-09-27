#!/usr/bin/env python3
"""Reject development writes that would leave less than 10% available space."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys


def available_capacity(path, stats, platform):
    """Use macOS discretionary capacity, never its more generous important-use budget."""
    total = stats.f_blocks * stats.f_frsize
    immediate = stats.f_bavail * stats.f_frsize
    if platform != "darwin":
        return total, immediate, immediate, "statvfs"
    script = '''ObjC.import("Foundation");
function run(args) {
    var url = $.NSURL.fileURLWithPath(args[0]);
    var keys = $([$.NSURLVolumeTotalCapacityKey,
                  $.NSURLVolumeAvailableCapacityForOpportunisticUsageKey]);
    return JSON.stringify(ObjC.deepUnwrap(url.resourceValuesForKeysError(keys, null)));
}'''
    result = subprocess.run(
        ["/usr/bin/osascript", "-l", "JavaScript", "-e", script, str(path)],
        check=True, capture_output=True, text=True, timeout=10)
    capacity = json.loads(result.stdout)
    available = capacity.get("NSURLVolumeAvailableCapacityForOpportunisticUsageKey")
    native_total = capacity.get("NSURLVolumeTotalCapacityKey")
    if (type(available) is not int or type(native_total) is not int
            or native_total != total or not 0 <= available <= total):
        raise ValueError("Invalid macOS discretionary disk capacity")
    return total, available, immediate, "macOS-opportunistic"


def check_capacity(path, required):
    stats = os.statvfs(path)
    total, available, immediate, source = available_capacity(path, stats, sys.platform)
    result = evaluate(total, available, required)
    result.update(immediateFreeBytes=immediate, capacitySource=source)
    # A build must fit now; do not depend on macOS purging files mid-build.
    if required > immediate:
        result["state"] = "blocked"
    return result


def evaluate(total, available, required):
    if total <= 0 or required < 0:
        raise ValueError("Invalid disk budget")
    remaining = available - required
    if remaining < total * 0.10:
        state = "blocked"
    elif remaining < total * 0.20:
        state = "warning"
    else:
        state = "ready"
    return {"state": state, "availableBytes": available, "requiredBytes": required,
            "remainingBytes": remaining, "minimumFreeBytes": int(total * 0.10)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    parser.add_argument("--required-bytes", required=True, type=int,
                        help="Peak additional storage, including compressed and unpacked inputs")
    args = parser.parse_args()
    path = args.path.absolute()
    while not path.exists():
        path = path.parent
    result = check_capacity(path, args.required_bytes)
    print(json.dumps(result))
    if result["state"] == "blocked":
        raise SystemExit("Insufficient disk headroom. Run reviewed retention or use another builder; do not prune protected images.")


if __name__ == "__main__":
    main()
