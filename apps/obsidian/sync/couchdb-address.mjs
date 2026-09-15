// A controller also joins the shared edge network. Generic service names can
// resolve another installation there, even when its own database is private.
export function couchDbAddress(environment) {
  const workspace = environment.SCHOLARSERVER_WORKSPACE_ID;
  const instance = environment.SCHOLARSERVER_INSTANCE_ID;
  if (workspace === undefined && instance === undefined) {
    return "http://livesync-couchdb:5984";
  }
  const identifier = /^[a-z0-9][a-z0-9-]*$/;
  if (!workspace || !instance || !identifier.test(workspace) || !identifier.test(instance)) {
    throw new Error("Valid workspace and instance identities are required for the database address");
  }
  return `http://obsidian-db-${workspace}-${instance}:5984`;
}
