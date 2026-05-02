import { invoke } from "@tauri-apps/api/core";

export type Provider = "gsc" | "ga4";

export interface GoogleInstalledClient {
  client_id: string;
  client_secret: string;
}

export interface OAuthConnectResult {
  email: string;
  scopes_granted: string[];
  record_key: string;
}

export type OAuthProbeResult =
  | { kind: "connected"; email: string; expires_at_unix: number; refreshed: boolean }
  | { kind: "needs_reauth"; reason: string }
  | { kind: "error"; reason: string };

export async function readOAuthClient(): Promise<GoogleInstalledClient> {
  return invoke("read_oauth_client");
}

export async function oauthConnect(
  targetClientId: string,
  provider: Provider,
  oauthClient: GoogleInstalledClient
): Promise<OAuthConnectResult> {
  return invoke("oauth_connect", {
    targetClientId,
    provider,
    oauthClientId: oauthClient.client_id,
    oauthClientSecret: oauthClient.client_secret,
  });
}

export async function oauthProbe(
  targetClientId: string,
  provider: Provider,
  storedBlob: string,
  oauthClient: GoogleInstalledClient
): Promise<OAuthProbeResult> {
  return invoke("oauth_probe", {
    targetClientId,
    provider,
    storedBlob,
    oauthClientId: oauthClient.client_id,
    oauthClientSecret: oauthClient.client_secret,
  });
}

export function recordKey(targetClientId: string, provider: Provider): string {
  return `${targetClientId}::${provider}`;
}
