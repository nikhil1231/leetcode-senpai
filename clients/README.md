# Clients: Senpai on your other screens

Small things that run outside the app and show what you are learning. The intent behind each is
in [docs/plans/ambient-learning.md](../docs/plans/ambient-learning.md). Nothing here is needed
for the app itself.

## One-time: a service token for machines

Phone shortcuts, widgets and scripts can't sign in to Cloudflare Access, so they send a
**service token** instead (as Noodle's clients do):

1. Cloudflare Zero Trust → Access → Service Auth → Service Tokens → Create, named
   `senpai-devices`. Copy the **client id** and **client secret**.
2. In the Access application for `leetcode.nikhil.ing`, add a policy with action **Service Auth**
   that includes that service token.
3. Add `ACCESS_SERVICE_TOKENS=<client id>` to `~/secrets/leetcode-senpai.env` and recreate the
   container. The app only accepts service tokens listed there, and treats them as you.

Every client below sends two headers: `CF-Access-Client-Id` and `CF-Access-Client-Secret`.

## iPhone

**Lock screen wallpaper (a colourful poster of what you hold worst).** The server makes the
posters on its own schedule (an infographic per weak lesson, checked by a second model, see
`server/wall_gen.py`) and changes the one that is up every two hours between 08:30 and 22:30; the
phone only fetches whichever is up. Import `Senpai wallpaper.shortcut` (it asks for the two token
values), or build it: Shortcuts → New shortcut "Senpai wallpaper":
1. Get Contents of URL `https://leetcode.nikhil.ing/api/wall/poster.png`, method GET, with the
   two headers above. (Default size fits an iPhone 15/16/17; add `?w=…&h=…` for another screen.)
2. Set Wallpaper → Lock Screen (turn off "Show Preview" and "Crop to Subject").

Then Automation → Time of Day, one automation per change (08:31, 10:31, 12:31, 14:31, 16:31, 18:31,
20:31), each Run Immediately → run "Senpai wallpaper". Also handy: Automation → Charger → Is
Connected. Every poster made, with its review: `GET /api/wall/posters`; make one now:
`POST /api/wall/posters`. `POST /api/wall/poster.png` (same headers) starts a new poster
and answers at once; a few minutes later, if it passes review, GET returns it for the next
WALL_SLOT_HOURS (2h), then the rotation resumes.

**Widget (home screen, lock screen, StandBy).** Install [Scriptable](https://scriptable.app),
add `ios/senpai-widget.js` as a script, run it once in the app (it asks for the address and the
token, kept in Scriptable's Keychain), then add a Scriptable widget and pick the script. On a
charging phone on its side, StandBy shows the same widget as a bedside poster. Tapping it opens
the feed.

**Questions tied to your day.** For each app you want (the list is `server/drip/apps.yaml`, or
`GET /api/drip/apps`): Automation → App → pick it → Is Opened → Run Immediately, with one action:
Get Contents of URL `https://leetcode.nikhil.ing/api/drip/opened`, method POST, the two headers
above, JSON body `app` = the app's name (e.g. `Uber`). The Telegram bot then sends a question
about how that app works within a second or two. It holds back when you are outside the drip's
hours, paused, were asked about that app in the last 3 hours, have had 4 today, or got a
question in the last 10 minutes. Don't add Telegram, Safari or Chrome: they would trigger
themselves.

**The YouTube toll** and the feed: see "Morning YouTube Shorts" in the plan. Before noon the
feed starts with last night's misses; from 20:00 with today's (`?set=` overrides).

**Daily podcast.** In Telegram: `/podcast` sends today's episode of Ripple After Dark (an audio
drama of 10 to 15 minutes about one lesson; see the README), `/podcast daily` sends
one every morning when the questions start. Telegram plays it in the background with lock-screen
controls. For a podcast app instead: set `PODCAST_TOKEN` (any long random string) in
`~/secrets/leetcode-senpai.env`, add a Cloudflare Access application for
`leetcode.nikhil.ing/podcast/*` with a **Bypass** policy (the token in the address is the lock),
recreate the container, and follow `https://leetcode.nikhil.ing/podcast/<token>/feed.xml` in
Apple Podcasts (Library → … → Follow a Show by URL).

## Mac desktop

```bash
mkdir -p ~/.local/bin ~/.config/senpai
cp mac/senpai-wallpaper ~/.local/bin/
printf 'SENPAI_URL=https://leetcode.nikhil.ing\nCF_ACCESS_CLIENT_ID=…\nCF_ACCESS_CLIENT_SECRET=…\n' > ~/.config/senpai/env
chmod 600 ~/.config/senpai/env
cp mac/ing.nikhil.senpai-wallpaper.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/ing.nikhil.senpai-wallpaper.plist
```

It runs at login and hourly, sizes the poster to the main screen, and keeps only the latest
image. The first run asks for permission to control System Events. Errors go to
`/tmp/senpai-wallpaper.log`.

## YouTube (desktop Chrome)

`youtube-extension/` adds a row, "For what you're learning", to the top of the YouTube home page:
two videos for each of your weakest lessons (Shorts and streams over 90 minutes left out), with
the lesson each one is for. It asks Senpai for the lessons (`/api/wall/topics`) and searches
YouTube itself, so no API key; results are kept for 3 hours. Install: `chrome://extensions` →
Developer mode → Load unpacked → this folder. Sign in to Senpai once in the same browser, or put
the service token in the extension's options (click its icon). ✕ hides the row for that visit.

## A wall, a TV, a projector

Open `https://leetcode.nikhil.ing/wall` full screen in any browser that is signed in (click once
for full screen; it keeps the screen awake where the browser allows). Options: `?every=45`
seconds per poster, `?reveal=18` seconds before the idea shows, `?map=5` (every fifth slide is
the fading map; `0` never), `?only=map`. `?print=1` gives six posters on one A4 page for a
weekly colour print.
