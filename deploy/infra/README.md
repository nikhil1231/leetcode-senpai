# Deploying the two services

The live stack lives in `~/infra/stacks/leetcode-senpai/` (outside this repo). These are the files it needs now that the
frontend is its own container. They are **not applied yet**: `bin/deploy` builds from GitHub `main`, so apply them in the
same sitting that `main` gets the `web/` directory, or the deploy loop will fail to build a service that has no source.

1. Copy `compose.yaml` and `stack.env` over `~/infra/stacks/leetcode-senpai/`.
2. Push `main` (this change). `infra-deploy@leetcode-senpai.timer` builds both images and starts them; it rolls both back
   together if `/api/health` does not come up.
3. Point the tunnel at the web container: in `~/infra/stacks/cloudflared`, `leetcode.nikhil.ing` goes to
   `http://leetcode-senpai-web:3000` (it was `http://leetcode-senpai:8080`).
4. `AUTH_MODE=access` stays on the API container. The web container needs no secrets: Cloudflare Access's cookie and
   `Cf-Access-Jwt-Assertion` header are forwarded to the API unchanged.

Note: `clients/` (the iOS widget, the Mac wallpaper, the YouTube extension) call `/api/...` and `/feed` on the same hostname,
so they need no change; their service-token headers pass through the proxy.
