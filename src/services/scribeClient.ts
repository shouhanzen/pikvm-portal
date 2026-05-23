export async function mintScribeToken(apiKey: string) {
  const response = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
  });

  if (!response.ok) {
    throw new Error(`Scribe token mint failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as { token?: string };
  if (!payload.token) {
    throw new Error("Scribe token response did not include a token.");
  }

  return payload.token;
}
