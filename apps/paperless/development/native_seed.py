"""Django fixture for disposable native-probe database only; not app provisioning."""

import json

from django.contrib.auth.models import Permission, User
from documents.models import Document
from rest_framework.authtoken.models import Token

assert not User.objects.exclude(
    username="AnonymousUser"
).exists(), "Refusing to seed an existing installation"
reader = User.objects.create_user(username="synthetic-reader")
other = User.objects.create_user(username="synthetic-other")
reader.user_permissions.add(Permission.objects.get(codename="view_document"))
other.user_permissions.add(Permission.objects.get(codename="view_document"))
visible = Document.objects.create(
    title="synthetic-visible",
    content="synthetic-visible-marker",
    owner=reader,
    checksum="a" * 32,
    mime_type="application/pdf",
)
hidden = Document.objects.create(
    title="synthetic-hidden",
    content="synthetic-hidden-marker",
    owner=other,
    checksum="b" * 32,
    mime_type="application/pdf",
)
token = Token.objects.create(user=reader)
print(
    "PROBE: "
    + json.dumps({"token": token.key, "visible": visible.pk, "hidden": hidden.pk})
)
