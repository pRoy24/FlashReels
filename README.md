# FlashReels

| Coming Soon |
| --- |
| **A minimal, step-controlled reel production desk for marketing teams and video editors.** |

FlashReels is a Next.js workspace for image-list-to-video generation. It is built around RunwayML generation so teams can compose a request, preview each completed stage, and keep a lightweight private library of finished outputs.

RunwayML is the primary creative generation provider for image and video assets. FlashReels uses it for text-to-image, image-to-video, task polling, and normalized output URLs. Defaults are `gen4_image` for images and `gen4.5` for image-to-video.

`samsar-js` is used briefly as the orchestration layer for Samsar v2 step-video jobs: creating requests, checking detailed status, and advancing to the next stage.

## Workflow

Prompts, reference images, generated frames, and generated videos move through the available APIs:

- `POST /api/samsar/step/start` creates a step-video request for `image_list_to_video`.
- `GET /api/samsar/step/status-detailed` returns render status plus stage resources for preview.
- `POST /api/samsar/step/process-next` advances the active request after review.
- `POST /api/runway/text-to-image` submits authenticated RunwayML text-to-image work.
- `POST /api/runway/image-to-video` submits authenticated RunwayML image-to-video work.
- `GET /api/runway/{adapter}/requests/{requestId}` returns authenticated normalized image or video results.
- `GET /api/library` and `POST /api/library` read and save private rendered-video records.

## Setup

```bash
npm install
npm run dev
```

The default dev command starts a local Next.js server without a public callback tunnel.

To start with local tunneling, use:

```bash
npm run dev:local
```

The tunnel command opens a temporary public callback URL and passes that URL to the app as `FLASHREELS_PUBLIC_BASE_URL`; without it, Samsar cannot reach the custom Runway adapter endpoints running on your machine.

The local dev server defaults to port `3000`. To use another port, pass it explicitly:

```bash
npm run dev -- --port 3010
npm run dev:local -- --port 3010
```

You can also set `FLASHREELS_DEV_PORT` in `.env.local` for a project-local override.

If Next.js reports that another dev server is already running, stop the listed PID before restarting on a different port.

Register or sign in, then configure keys and the server secret in the authenticated startup wizard or through environment variables:

- `FLASHREELS_RUNWAYML_API_KEY`
- `FLASHREELS_SAMSAR_API_KEY`
- `FLASHREELS_SERVER_SECRET`

The server secret must be at least 24 characters, contain no whitespace, and include at least three character classes across lowercase, uppercase, numbers, and symbols. FlashReels sends this secret to Samsar as the custom adapter API key and validates it on every adapter request before calling RunwayML.

In local development, wizard saves are written to the encrypted `.flashreels` store and mirrored into `.env.local` for future dev-server restarts. Set `FLASHREELS_ENV_FILE` to another project-local `.env*` file name if needed, or set `FLASHREELS_WRITE_ENV_FILE=0` to disable env-file writes.

On Vercel, runtime code cannot persist changes to deployment env files. Run the deploy bootstrap once to create/connect the official Redis Marketplace resource on the provider default free tier:

```bash
npm run deploy:setup:production
```

Vercel should inject `REDIS_URL`; FlashReels also supports `KV_URL`, `KV_REST_API_URL` / `KV_REST_API_TOKEN`, `REDIS_REST_API_URL` / `REDIS_REST_API_TOKEN`, and `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` if a different Redis provider is configured. The authenticated wizard will then save encrypted secrets to Redis and bootstrap a persistent encryption seed automatically. If you do not want runtime secret storage, set `FLASHREELS_SAMSAR_API_KEY` directly in the Vercel project environment variables instead.

To copy local admin/feed data into production Redis, run:

```bash
npm run deploy:migrate:production
```

Optional defaults are documented in `.env.example`, including base URLs, Runway model names, the public callback base URL, env-file controls, and Vercel Redis / Upstash persistence variables.

## Creator Modes

The `/app` creator now exposes three editing surfaces:

- `Simple` for prompt, image URLs, aspect ratio, duration, subtitles, outro URL, footer URL, footer toggle, and avatar toggle.
- `Advanced` for the same workflow plus image model, video model, custom image-to-video model, avatar model, CTA copy, and metadata.
- `JSON` for loose object-literal editing with validation, preview, and support for unquoted keys or trailing commas.

## API Keys

RunwayML:

1. Sign in to RunwayML.
2. Open the developer or API settings area.
3. Create an API key.
4. Add it in the authenticated FlashReels startup wizard or set `FLASHREELS_RUNWAYML_API_KEY`.

Samsar:

1. Sign in to Samsar.
2. Open the API key settings for your account.
3. Create an API key.
4. Add it in the authenticated FlashReels startup wizard or set `FLASHREELS_SAMSAR_API_KEY`.

Server secret:

1. Generate a unique secret for this FlashReels instance.
2. Add it in the authenticated startup wizard or set `FLASHREELS_SERVER_SECRET`.
3. Rotate it if a local tunnel URL or deployment is shared outside your team.

## Credits

Response to RunwayML hackathon 2026.

## License

MIT. See [LICENSE](./LICENSE).
