#!/usr/bin/env bash
# Deploy the live Leetcode Senpai (leetcode.nikhil.ing, :8200) to origin/main.
#
#     deploy/update.sh            # deploy if origin/main moved
#     deploy/update.sh --check    # say what a deploy would do, change nothing
#     deploy/update.sh --force    # reinstall + restart even if already at head
#     deploy/update.sh --poll     # unattended: skip on conditions a human would fix
#
# Runs *on the laptop*. From a dev machine use deploy/deploy.sh, which is just
# this script over ssh.
#
# Unlike sync-integration.sh, this never does `git reset --hard`: the live
# service serves this working tree, and it is also the tree ticket-runner builds
# in, so a stray edit here is someone's work rather than drift to be flattened.
# A dirty tree aborts the deploy instead.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${LEETCODE_BRANCH:-main}"
SERVICE="${LEETCODE_SERVICE:-leetcode-senpai.service}"
HEALTH_URL="${LEETCODE_HEALTH_URL:-http://localhost:8200/api/health}"
UV="${UV:-$HOME/.local/bin/uv}"
cd "$REPO"

CHECK=0; FORCE=0; POLL=0
for arg in "$@"; do
    case "$arg" in
        --check|-n) CHECK=1 ;;
        --force|-f) FORCE=1 ;;
        --poll)     POLL=1 ;;
        *) echo "usage: $0 [--check] [--force] [--poll]" >&2; exit 2 ;;
    esac
done

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m warn\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m!!\033[0m %s\n' "$*" >&2; exit 1; }

# In --poll the caller is a timer, not a person. A dirty tree or a failed fetch
# is then a reason to come back in a couple of minutes, not a failure: marking
# the unit failed every tick for a condition only a human can clear turns
# `systemctl --user status` into noise and hides the deploys that broke for real.
skip_or_die() {
    if [ "$POLL" -eq 1 ]; then
        say "$1 — skipping this round"
        exit 0
    fi
    die "$2"
}

# A config key this deploy *introduces* is a 503 or a crash at request time, and
# worth a shout — ACCESS_AUD arriving unset is exactly that. A key absent for
# months is optional or already known about, and warning about it every deploy
# is how a warning stops being read, so only the diff counts.
report_new_config_keys() {
    [ "$config" -eq 1 ] && [ -f .env.local ] && [ -f .env.example ] || return 0
    local added missing
    added="$(git diff "$before" "$target" -- .env.example \
             | sed -n 's/^+#\? *\([A-Z_][A-Z0-9_]*\)=.*/\1/p' | sort -u)"
    [ -n "$added" ] || return 0
    missing="$(comm -23 <(printf '%s\n' "$added") \
                        <(sed -n 's/^\([A-Z_][A-Z0-9_]*\)=.*/\1/p' .env.local | sort -u))"
    [ -n "$missing" ] && warn "this deploy added config that .env.local does not set: $(printf '%s' "$missing" | tr '\n' ' ')"
    return 0
}

# Serialise deploys. The timer and a manual `lc-deploy` can fire at the same
# moment, and two of these interleaving over one working tree is a bad
# afternoon. --check changes nothing, so it never queues behind a running
# deploy. The lock lives in .git and not $TMPDIR, because a systemd unit and a
# login shell need not agree on what $TMPDIR is, and two deploys each holding
# their own private lock file is the same as no lock at all.
if [ "$CHECK" -eq 0 ]; then
    exec 9>"$REPO/.git/leetcode-deploy.lock"
    flock -w 600 9 || die "another deploy has held the lock for 10 minutes; check on it."
fi

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    [ "$POLL" -eq 0 ] && git status --short --untracked-files=no >&2
    skip_or_die "working tree has uncommitted changes" \
                "working tree has uncommitted changes — commit, stash or revert them first."
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$current_branch" = "$BRANCH" ] || skip_or_die \
    "on branch '$current_branch', not '$BRANCH'" \
    "on branch '$current_branch', expected '$BRANCH'. The integration branch belongs to the -testing checkout."

before="$(git rev-parse HEAD)"
git fetch --quiet origin "$BRANCH" || skip_or_die \
    "could not reach origin" "git fetch origin $BRANCH failed."
target="$(git rev-parse FETCH_HEAD)"

# "Already deployed" is not `before = target` — it is target being *contained in*
# HEAD. Testing equality calls an unpushed local commit a deploy: nothing to
# merge, but a pointless restart, which is a silly way to bounce the live site
# on every tick.
if [ "$FORCE" -eq 0 ] && git merge-base --is-ancestor "$target" "$before"; then
    # Nothing to do is the timer's normal answer, hundreds of times a day.
    # Saying so every time buries the ticks that did something.
    [ "$POLL" -eq 1 ] || say "already at $(git log --oneline -1 HEAD)"
    exit 0
fi

changed() { ! git diff --quiet "$before" "$target" -- "$@"; }

if [ "$before" != "$target" ]; then
    say "$(git rev-list --count "$before".."$target") new commit(s):"
    git log --oneline --reverse "$before".."$target" | sed 's/^/    /'
fi

deps=0; config=0
[ "$before" != "$target" ] && {
    { changed uv.lock || changed pyproject.toml; } && deps=1
    changed .env.example && config=1
}
[ "$FORCE" -eq 1 ] && deps=1

if [ "$CHECK" -eq 1 ]; then
    say "would deploy ${before:0:7} -> ${target:0:7}"
    [ "$deps" -eq 1 ] && echo "    - uv sync --locked --no-dev"
    echo "    - restart $SERVICE and wait for $HEALTH_URL"
    exit 0
fi

say "pulling $BRANCH"
# Diverged — a commit made on the box that origin does not have — is the other
# thing only a human can untangle, so the timer leaves it alone rather than
# failing every tick until someone notices.
git merge --ff-only --quiet "$target" || skip_or_die \
    "cannot fast-forward to origin/$BRANCH — the tree has diverged" \
    "cannot fast-forward to origin/$BRANCH; the tree has diverged from origin."

# Always, not only when the lockfile moved: a previous deploy may have failed
# half-way through its sync, and `uv sync` is a fast no-op when it is current.
say "syncing dependencies"
"$UV" sync --locked --no-dev --quiet

say "restarting $SERVICE"
systemctl --user restart "$SERVICE"

# The health endpoint is deliberately unauthenticated, which is what lets a
# deploy ask "did it come up?" without holding an Access assertion.
for _ in $(seq 1 30); do
    if curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
        say "healthy — now at $(git log --oneline -1 HEAD)"
        report_new_config_keys
        exit 0
    fi
    sleep 1
done

printf '\n'
systemctl --user --no-pager --lines=25 status "$SERVICE" >&2 || true
die "did not come healthy within 30s. Previous good revision was ${before:0:7}
   (roll back with: git -C $REPO reset --hard $before && systemctl --user restart $SERVICE)"
