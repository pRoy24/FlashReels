# FlashReels

<div align="center">

| Coming Soon |
| --- |
| **A minimal, step-controlled reel production desk for technical video editors.** |

</div>

FlashReels is a Next.js workspace for prompt-led and image-led short-form video generation. It is built for editors who think in shots, aspect ratios, references, timing, subtitles, and reviewable render states, not generic one-click output.

The current build connects Samsar step-video orchestration with RunwayML generation adapters so teams can compose a request, advance the render step by step, inspect status, and keep a lightweight private library of finished outputs.

## Providers

| Provider | Role in FlashReels | Current integration |
| --- | --- | --- |
| RunwayML | Generation adapter for image and video assets | Uses the Runway API for `text_to_image`, `image_to_video`, task polling, and normalized output URLs. Defaults: `gen4_image` for images and `gen4.5` for image-to-video. |
| SamsarJS | Video workflow orchestration | Uses `samsar-js` to create Samsar v2 step text-to-video and image-list-to-video jobs, check detailed status, and process the next step in a request. |

## Content Flow

FlashReels does not ship bundled creative content. Prompts, reference images, generated frames, and generated videos move through the available APIs:

- `POST /api/samsar/step/start` creates a Samsar step-video request for `text_to_video` or `image_list_to_video`.
- `POST /api/samsar/step/process-next` advances the active Samsar request.
- `GET /api/samsar/step/status` and `GET /api/samsar/step/status-detailed` return render status for editorial review.
- `POST /api/runway/{environment}/text-to-image` submits RunwayML text-to-image work for Samsar custom adapters.
- `POST /api/runway/{environment}/image-to-video` submits RunwayML image-to-video work for Samsar custom adapters.
- `GET /api/runway/{environment}/{adapter}/requests/{requestId}` returns normalized image or video results.
- `GET /api/library` and `POST /api/library` read and save private rendered-video records.

## Setup

```bash
npm install
npm run dev
```

Configure keys in the startup wizard or through environment variables:

- `FLASHREELS_STAGING_SAMSAR_API_KEY`
- `FLASHREELS_STAGING_RUNWAYML_API_KEY`
- `FLASHREELS_PRODUCTION_SAMSAR_API_KEY`
- `FLASHREELS_PRODUCTION_RUNWAYML_API_KEY`

Optional defaults are documented in `.env.example`, including Samsar and Runway base URLs, Runway model names, and Vercel Redis / Upstash persistence variables.

## License

MIT. See [LICENSE](./LICENSE).
