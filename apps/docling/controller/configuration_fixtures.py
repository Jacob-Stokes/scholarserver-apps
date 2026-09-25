#!/usr/bin/env python3
"""Emit synthetic Docling section responses for the core parser contract test."""

import json
import tempfile
from pathlib import Path
from unittest import mock

import controller


def configuration_fixture_cases():
    with tempfile.TemporaryDirectory(prefix="docling-configuration-fixture-") as temporary:
        runtime = Path(temporary) / "runtime"
        documents = Path(temporary) / "documents"
        documents.mkdir()
        with mock.patch.object(controller, "RUNTIME", runtime), \
                mock.patch.object(controller, "DATABASE", runtime / "jobs.sqlite"), \
                mock.patch.object(controller, "REQUESTS", runtime / "requests"), \
                mock.patch.object(controller, "RESPONSES", runtime / "responses"), \
                mock.patch.object(controller, "DOCUMENTS", documents), \
                mock.patch.object(controller, "engine_health", return_value="available"):
            controller.migrate()
            return {
                "docling-defaults": controller.configuration_section("defaults"),
                "docling-queue": controller.configuration_section("queue"),
                "docling-service": controller.configuration_section("service"),
            }


if __name__ == "__main__":
    print(json.dumps(configuration_fixture_cases()))
