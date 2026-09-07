# Custom third-party APIs (v0.5.0-beta.1 customization)

This customization is based on release commit `6cbbe22cc6492159e0f649d507e4e21a9aec3074`. It adds user-owned API connections without changing the database schema, the release Compose files, the Caddyfile, existing credentials, or stored project data.

## Configuration

In **Profile → API configuration → Custom third-party API**, choose a protocol, enter a connection name, HTTPS Base URL, and your API key. Save the connection, add the provider's exact model ID in its provider row, then select that model in the slots at the top. Model IDs are not translated or inferred from names. Several connections using the same protocol can coexist.

| Protocol | Base URL includes | Requests |
| --- | --- | --- |
| OpenAI Chat Completions | Provider's API prefix, commonly `/v1` | `POST /chat/completions` |
| OpenAI Responses | Provider's API prefix, commonly `/v1` | `POST /responses` |
| OpenAI Images | Provider's API prefix, commonly `/v1` | `POST /images/generations`, multipart `POST /images/edits` |
| Anthropic Messages | Provider's API prefix, commonly `/v1` | Native `POST /messages`, `x-api-key`, `anthropic-version` |
| Gemini GenerateContent | Provider's API prefix, commonly `/v1beta` | Native `POST /models/{model}:generateContent` / `:streamGenerateContent`, `x-goog-api-key` |

A full endpoint for the selected protocol is also accepted and normalized to its base. Version prefixes are not guessed. Use the URL documented by your service; do not put credentials or query parameters in it. Private-network, loopback, and metadata-service destinations are blocked. This version does not add local Ollama or private LAN access.

Keys are write-only in the API, encrypted with the existing application encryption key at rest, and cleared from the input after saving. An unchanged connection may retain its saved key by leaving the input blank. Changing the destination requires entering a key again. Never send real keys in chat, commit them, or put them in URLs. Keep the existing `API_ENCRYPTION_KEY`; changing it would make old saved keys unreadable.

**Check saved connection** requests only the provider's models list. It never generates text, images, or other paid content. A successful check does not prove every model supports every tool or capability. A failed check can also mean the service does not implement `/models`.

## Assistant and media behavior

The main Codex assistant keeps its local Responses wire protocol. Chat Completions, native Anthropic and native Gemini are translated at the application gateway. Text streams, JSON function calls, parallel tool results, custom text tools, inline images, cancellation, and token usage are supported. Gemini thought signatures and native reasoning needed for replay are retained as authenticated encrypted continuation data, bound to the user, project, model and endpoint. The bridge makes one upstream submission per attempt and does not execute tools itself or retry a potentially accepted generation.

OpenAI Responses connections use the upstream Responses endpoint directly. Other protocols require full conversation history; upstream `previous_response_id`, provider-hosted tools such as `web_search`, arbitrary provider-specific extension fields, and generated file output inside a language-model response are not translated. The application's separate web-search configuration remains separate. Native Gemini image generation is not included: use the OpenAI Images protocol for custom image services. If switching protocol or endpoint for an existing conversation, use a fresh conversation when the previous provider's opaque continuation cannot be replayed.

For custom image generation, choose a resolution in the model slot. Numeric values (`1024`, `1536`, `2048`) are long-edge targets converted with the project's aspect ratio to pixel dimensions in multiples of 8. Explicit `WIDTHxHEIGHT` presets are sent unchanged and take precedence over the project ratio. Choose dimensions supported by your model; unsupported dimensions return the provider's error and are not silently retried with another size. One reference image is supported through multipart edits. Returned URL and base64 PNG/JPEG/WebP images are accepted. These generic connection templates do not promise that every model implements every optional image field.

Custom models are intended for self-hosted `BILLING_MODE=OFF`. No prices are invented for arbitrary model IDs. OFF disables the application's billing ledger; it does not make a third-party provider free.

## Validation and deployment

All protocol tests use simulated HTTP responses and simulated storage. No real provider keys or paid generation calls are needed. Validation includes native SDK request formats, Anthropic and Gemini tool-result replay, Gemini thought signatures, cancellation, truncated streams, image generation/editing, credential encryption and isolation, endpoint changes, SSRF protection, and existing provider contracts. The settings form was also exercised in a separate browser preview using in-memory data and placeholder keys. This does not substitute for an authenticated end-to-end test on the deployed instance.

Follow `docs/INSTALL.md` section 5 for a customized release: build **both** Dockerfiles from this same snapshot, publish to a registry you control, record the actual immutable digests, then use section 4's blue/green Worker upgrade. Do not use a guessed image reference or replace a running image with a mutable tag. Keep existing volumes and encryption keys; do not run `down -v` or database resets.

Preserve the release Caddyfile, Caddy default startup and `/data` + `/config` named volumes. Keep `SELF_HOSTED_HOST=localhost`, `SELF_HOSTED_HTTPS_PORT=1443`, and `APP_HOST_PORT=13000` for redirects only; let the overlay derive `NEXTAUTH_URL`. Certificate trust still requires the owner's explicit approval; only export the public `root.crt`, never `root.key`, and never disable TLS checks. SSE tab connections are not AI task concurrency quotas.

Protocol references: [OpenAI Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses), [Anthropic streaming](https://platform.claude.com/docs/en/build-with-claude/streaming), [Gemini GenerateContent](https://ai.google.dev/api/generate-content), [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling).

The customized `docker-publish.yml` workflow is manual-only and restricted to `peanutcats/waoowaoo`. It builds both images on native `ubuntu-24.04-arm` runners for this installation's `linux/arm64` architecture. It publishes commit-specific tags, records actual digests in the job summary/log, and never deploys to a local machine. The fork's `main` branch does not need to be replaced to publish a feature-branch snapshot.
