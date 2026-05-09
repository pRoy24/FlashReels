# FlashReels

| Coming Soon |
| --- |
| **A minimal, step-controlled reel production desk for marketing teams and video editors.** |

FlashReels is a Next.js workspace for prompt-led and image-led video generation. It is built around RunwayML generation so teams can compose a request, preview each completed stage, and keep a lightweight private library of finished outputs.

RunwayML is the primary creative generation provider for image and video assets. FlashReels uses it for text-to-image, image-to-video, task polling, and normalized output URLs. Defaults are `gen4_image` for images and `gen4.5` for image-to-video.

`samsar-js` is used briefly as the orchestration layer for Samsar v2 step-video jobs: creating requests, checking detailed status, and advancing to the next stage.

## Workflow

Prompts, reference images, generated frames, and generated videos move through the available APIs:

- `POST /api/samsar/step/start` creates a step-video request for `text_to_video` or `image_list_to_video`.
- `GET /api/samsar/step/status-detailed` returns render status plus stage resources for preview.
- `POST /api/samsar/step/process-next` advances the active request after review.
- `POST /api/runway/text-to-image` submits authenticated RunwayML text-to-image work.
- `POST /api/runway/image-to-video` submits authenticated RunwayML image-to-video work.
- `GET /api/runway/{adapter}/requests/{requestId}` returns authenticated normalized image or video results.
- `GET /api/library` and `POST /api/library` read and save private rendered-video records.

## Setup

```bash
npm install
npm run dev -- --local
```

Local development requires `--local`. The dev script opens a temporary public callback tunnel and passes that URL to the app as `FLASHREELS_PUBLIC_BASE_URL`; without it, Samsar cannot reach the custom Runway adapter endpoints running on your machine.

Configure keys and the server secret in the startup wizard or through environment variables:

- `FLASHREELS_RUNWAYML_API_KEY`
- `FLASHREELS_SAMSAR_API_KEY`
- `FLASHREELS_SERVER_SECRET`

The server secret must be at least 24 characters, contain no whitespace, and include at least three character classes across lowercase, uppercase, numbers, and symbols. FlashReels sends this secret to Samsar as the custom adapter API key and validates it on every adapter request before calling RunwayML.

Optional defaults are documented in `.env.example`, including base URLs, Runway model names, the public callback base URL, and Vercel Redis / Upstash persistence variables.

## API Keys

RunwayML:

1. Sign in to RunwayML.
2. Open the developer or API settings area.
3. Create an API key.
4. Add it in the FlashReels startup wizard or set `FLASHREELS_RUNWAYML_API_KEY`.

Samsar:

1. Sign in to Samsar.
2. Open the API key settings for your account.
3. Create an API key.
4. Add it in the FlashReels startup wizard or set `FLASHREELS_SAMSAR_API_KEY`.

Server secret:

1. Generate a unique secret for this FlashReels instance.
2. Add it in the startup wizard or set `FLASHREELS_SERVER_SECRET`.
3. Rotate it if a local tunnel URL or deployment is shared outside your team.

## Credits

Response to RunwayML hackathon 2026.

## License

MIT. See [LICENSE](./LICENSE).
