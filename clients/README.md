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

**Lock screen wallpaper (a new question every two hours, its answer the hour after).**
Shortcuts → New shortcut "Senpai wallpaper":
1. Get Contents of URL `https://leetcode.nikhil.ing/api/wall/poster.png`, method GET, with the
   two headers above. (Default size fits an iPhone 15/16; add `?w=…&h=…` for another screen.
   The top 30% is left clear for the clock; `&top=0` for a home screen.)
2. Set Wallpaper → Lock Screen (turn off "Show Preview" and "Crop to Subject").

Then Automation → Time of Day, one automation per hour you want it to change (for example 08:00,
10:00 … 22:00, and 09:00, 11:00 … for the answers), each Run Immediately → run "Senpai wallpaper".
Also handy: Automation → Charger → Is Connected.

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

## A wall, a TV, a projector

Open `https://leetcode.nikhil.ing/wall` full screen in any browser that is signed in (click once
for full screen; it keeps the screen awake where the browser allows). Options: `?every=45`
seconds per poster, `?reveal=18` seconds before the idea shows, `?map=5` (every fifth slide is
the fading map; `0` never), `?only=map`. `?print=1` gives six posters on one A4 page for a
weekly colour print.
