# Deploying the two services

The live stack lives in `~/infra/stacks/leetcode-senpai/` (outside this repo). These are the files it needs now that the
frontend is its own container. `bin/deploy` builds from GitHub `main`, so they only work once `main` has the `web/`
directory: until then the web image has no source to build and the deploy loop keeps the old stack running.

1. Copy `compose.yaml` and `stack.env` over `~/infra/stacks/leetcode-senpai/`.
2. Push `main` (this change). `infra-deploy@leetcode-senpai.timer` builds both images and starts them; it rolls both back
   together if `/api/health` does not come up.
3. The tunnel route needs no change: the web container listens on 8080 and carries the `leetcode-senpai` alias on the
   edge network, so `leetcode.nikhil.ing` -> `http://leetcode-senpai:8080` (and personal-mcp's `SENPAI_URL`) now reach
   it. The API container is `leetcode-senpai-api`, on the stack's own network only.
4. `AUTH_MODE=access` stays on the API container. The web container needs no secrets: Cloudflare Access's cookie and
   `Cf-Access-Jwt-Assertion` header are forwarded to the API unchanged.

Note: `clients/` (the iOS widget, the Mac wallpaper, the YouTube extension) call `/api/...` and `/feed` on the same hostname,
so they need no change; their service-token headers pass through the proxy.
