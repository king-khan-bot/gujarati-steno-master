# Gujarati Steno Master

A no-login Gujarati stenography practice site built for Cloudflare Pages + Pages Functions + Gemini API.

## Features
- GSSSB, GPSC, GCC, High Court practice categories
- 2, 4, 5 minute duration; 60, 80, 90, 110 WPM selections
- Gemini-generated Gujarati passage and 30/30/30 vocabulary groups
- Gemini TTS audio, female/male voice selection, playback and WAV download
- Responsive mobile-friendly interface
- Footer credit: Developed by – Gohel Dhruv

## Important notes
- This project is a deployable starter, not yet a live hosted website.
- AI-generated passages should be reviewed before treating them as official exam material. For High Court mode the prompt specifically avoids invented case citations; it generates general legal/judicial subject matter, not verified copies of real judgments.
- Gemini TTS supports Gujarati, but voice quality, accent and actual WPM must be tested with sample passages. The requested WPM is a target instruction to the TTS model, not a guaranteed metronomic rate.
- The app downloads Gemini's WAV audio. Playback speed can be selected as 60/80/90/110 WPM; the download link also renders a WAV at the selected relative playback speed in the browser.
- API usage may exceed free-tier quotas; Cloudflare hosting can be on a free plan, but Gemini quotas/pricing are separate and can change.

## Deploy to Cloudflare Pages
1. Create a GitHub repository and upload the contents of this folder.
2. In Cloudflare Dashboard, open **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select the repository.
4. Framework preset: **None**. Build command: leave blank. Build output directory: `public`.
5. Deploy the project.
6. Open the Pages project → **Settings** → **Variables and Secrets** → **Add**.
7. Add a secret named `GEMINI_API_KEY` and paste your Gemini API key. Do not put the key in `public/app.js`, HTML, or any public file.
8. Redeploy the project so the Functions receive the secret.
9. Open the `*.pages.dev` address and test passage generation and audio.

Official Cloudflare Pages Functions secret instructions:
https://developers.cloudflare.com/pages/functions/bindings/

## Gemini models used
- Text generation: `gemini-3.8-flash`
- Text-to-speech: `gemini-3.8-flash-tts`

Gemini TTS documentation:
https://ai.google.dev/gemini-api/docs/generate-content/speech-generation

## Local preview
Install Node.js, then from this directory:
```bash
npx wrangler pages dev public
```
For local API testing, create `.dev.vars` in this project root:
```dotenv
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
```
Do not commit `.dev.vars`. The production secret must be added in Cloudflare dashboard.
