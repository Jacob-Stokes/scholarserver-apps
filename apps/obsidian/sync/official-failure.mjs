import { ConfigurationActionRejected } from "@scholarserver/controller-runtime/configuration-actions";

export function restoredUnenrolledOfficialState(savedStatus) {
  // Completed enrollment and interrupted initial downloads require their own
  // recovery checks; only the completed account step can resume here.
  if (savedStatus?.profile === "official" && savedStatus.state === "vault-selection-required") {
    return "vault-selection-required";
  }
  return "setup-required";
}

export function officialCommandFailure(credentialKind, output) {
  if (credentialKind === "vault") {
    // The official client validates the key before saving its vault connection.
    // A transport failure during validation is not proof of a wrong password.
    if (/wrong vault key/i.test(output)) {
      return new ConfigurationActionRejected("Vault encryption password was not accepted. Correct it and try again.");
    }
    if (/password not provided/i.test(output)) {
      return new ConfigurationActionRejected("Enter the vault encryption password and try again.");
    }
    return new Error("Obsidian could not open the selected vault");
  }
  if (credentialKind === "account") return new Error("Obsidian account sign-in was not accepted");
  return new Error("Obsidian could not complete this operation. Check your connection and retry.");
}

export function unconfiguredVaultRejection({ receipt, status, busy, enrolled, vaultEntries, localVaults }) {
  if (
    busy ||
    enrolled ||
    status.profile !== "official" ||
    (status.state !== "vault-selection-required" && status.state !== "setup-required") ||
    receipt.status !== "unconfirmed" ||
    receipt.actionId !== "connect-vault" ||
    receipt.sectionId !== "setup" ||
    vaultEntries.length !== 0 ||
    !Array.isArray(localVaults) ||
    localVaults.length !== 0
  )
    return null;
  // No configured replica or downloaded data exists. The durable vault binding
  // still restricts a corrected attempt to the originally selected remote vault.
  const message =
    status.state === "setup-required"
      ? "The vault connection did not complete. Sign in again, then retry the same vault."
      : "The vault connection did not complete. Check the encryption password and retry the same vault.";
  return new ConfigurationActionRejected(message);
}
