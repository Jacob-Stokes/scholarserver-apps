export type EndpointAccessTransport =
  | "tailscale"
  | "cloudflare"
  | "tailscale-funnel"
  | "caddy"
  | "external-proxy";

export interface EndpointAccessOption {
  id: string;
  transport: EndpointAccessTransport;
  label: string;
  url: string;
  recommended: boolean;
  advanced: boolean;
  authentication: {
    authentik: "optional" | "required" | "unsupported";
    available: boolean;
    defaultEnabled: boolean;
  };
}

export function EndpointAccessSelector({
  options,
  optionId,
  authentication,
  onOptionChange,
  onAuthenticationChange
}: {
  options: EndpointAccessOption[];
  optionId: string;
  authentication: "none" | "authentik";
  onOptionChange: (option: EndpointAccessOption) => void;
  onAuthenticationChange: (authentication: "none" | "authentik") => void;
}) {
  const selected = options.find((option) => option.id === optionId) ?? null;
  return (
    <div className="ss-stack">
      {options.map((option) => (
        <label className="ss-choice" key={option.id}>
          <input
            type="radio"
            name="endpoint-access"
            checked={optionId === option.id}
            onChange={() => onOptionChange(option)}
          />
          <span>
            <strong>
              {option.label} {option.recommended ? <em>Recommended</em> : null}{" "}
              {option.advanced ? <em>Advanced</em> : null}
            </strong>
            <small>{description(option.transport)}</small>
            <code>{option.url}</code>
          </span>
        </label>
      ))}
      {selected && selected.authentication.authentik !== "unsupported" ? (
        <label className="ss-choice">
          <input
            type="checkbox"
            checked={authentication === "authentik"}
            disabled={selected.authentication.authentik === "required" || !selected.authentication.available}
            onChange={(event) => onAuthenticationChange(event.target.checked ? "authentik" : "none")}
          />
          <span>
            <strong>Require ScholarServer sign-in</strong>
            <small>
              {selected.authentication.available
                ? "People must sign in before this application interface opens. This does not affect private connections between containers."
                : "Finish setting up ScholarServer sign-in in Access before enabling this layer."}
            </small>
          </span>
        </label>
      ) : null}
    </div>
  );
}

function description(transport: EndpointAccessTransport): string {
  if (transport === "tailscale") return "Private to devices signed in to your Tailscale network.";
  if (transport === "tailscale-funnel") return "Public HTTPS through your Tailscale address.";
  if (transport === "cloudflare") return "Public HTTPS through the Cloudflare connection configured in Access.";
  if (transport === "caddy") return "Public HTTPS sent directly to this server.";
  return "Uses the HTTPS reverse proxy that you manage.";
}
