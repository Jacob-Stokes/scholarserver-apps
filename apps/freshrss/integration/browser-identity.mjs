import { createHash, createPublicKey, verify } from "node:crypto";
import { z } from "zod";

export const identityBinding = z
  .object({
    version: z.literal(1),
    audience: z
      .string()
      .regex(/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/)
      .max(150),
    subject: z.string().min(1).max(256),
    username: z.string().min(1).max(150),
    publicKey: z.string().min(1).max(1024)
  })
  .strict();

export function bindingFingerprint(binding) {
  return createHash("sha256")
    .update(JSON.stringify(identityBinding.parse(binding)))
    .digest("hex");
}

export function validateBinding(value) {
  const binding = identityBinding.parse(value);
  if (createPublicKey(binding.publicKey).asymmetricKeyType !== "ed25519") throw new Error("Invalid sign-in key.");
  return binding;
}

export function verifyBrowserIdentity(token, binding, method, path, now = Date.now()) {
  if (typeof token !== "string" || token.length > 4096) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return false;
  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    if (header.alg !== "EdDSA" || header.typ !== "JWT" || Object.keys(header).length !== 2) return false;
    if (
      !verify(
        null,
        Buffer.from(`${parts[0]}.${parts[1]}`),
        createPublicKey(binding.publicKey),
        Buffer.from(parts[2], "base64url")
      )
    )
      return false;
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    const seconds = Math.floor(now / 1000);
    return (
      claims.iss === "scholarserver-manager" &&
      claims.aud === binding.audience &&
      claims.sub === binding.subject &&
      claims.endpoint === "reader" &&
      claims.method === method &&
      claims.path === path &&
      Number.isInteger(claims.iat) &&
      Number.isInteger(claims.exp) &&
      claims.iat <= seconds + 5 &&
      claims.iat >= seconds - 35 &&
      claims.exp > seconds &&
      claims.exp <= claims.iat + 30
    );
  } catch {
    return false;
  }
}
