#!/usr/bin/env bash
# Claude Code Stop hook (.claude/settings.json): a fast check after every turn.
#   1. `node --check` on every .mjs/.js under CHECK_DIRS;
#   2. if that passes, one build of the repo's own banner.config.mjs and one
#      of each CARD_CONFIGS banner (its cards offline, from the snapshot beside
#      it) into a temp dir, each judged by its exit code only.
# Green: exit 0, no output. Red: the first MAX_LINES lines of output on stderr,
# exit 2 (Claude Code feeds stderr back to the model and keeps the turn open).
# No node: exit 0 silently.
# Started from Git Bash/MSYS/Cygwin on Windows, it re-runs itself inside WSL,
# where the repo and node live; it runs natively only if WSL is unusable.
set -u

# Once per turn: Claude Code passes the Stop hook input as JSON on stdin, and
# "stop_hook_active": true means this hook already blocked the current turn
# once. Let the stop through then, so an unfixable failure cannot loop the
# session. No stdin (a terminal, or </dev/null) means a manual run: check.
# Claude Code closes stdin after the JSON, so the read ends at EOF at once; the 1 s
# timeout only spares a caller that leaves stdin open (a plain `cat` would hang there).
input=""
[ -t 0 ] || IFS= read -r -d '' -t 1 input || true
printf '%s' "$input" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true' && exit 0

MAX_LINES=60
CHECK_DIRS=(bin src tools)
CLI=bin/ascii-banner.mjs
CONFIG=banner.config.mjs
CARD_CONFIGS=docs/examples/card*.config.mjs
# The distro used when the repo is not opened over \\wsl.localhost\<distro>\.
DEFAULT_WSL_DISTRO=${STOP_CHECK_WSL_DISTRO:-Ubuntu}

self_name=${BASH_SOURCE[0]##*/}
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd) || exit 0

# wsl.exe without MSYS argument conversion, which would rewrite /home/... into
# C:/Program Files/Git/home/...; scoped to the call so a native fallback still
# converts the paths it hands to node.exe.
wsl() { MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' wsl.exe "$@"; }

case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*)
    # Git Bash spells a WSL share //wsl.localhost/<distro>/... (or //wsl$/...).
    distro=$DEFAULT_WSL_DISTRO
    lower=${here,,}
    if [[ $lower == //wsl.localhost/* || $lower == //wsl\$/* ]]; then
      rest=${here#//*/}
      distro=${rest%%/*}
    fi
    if command -v wsl.exe >/dev/null 2>&1 && command -v cygpath >/dev/null 2>&1; then
      # --exec, not --: `wsl.exe -- cmd` hands the line to the distro's shell,
      # which strips the backslashes of \\wsl.localhost\... and splits on spaces.
      # A missing distro prints its error to stdout, so the /* test rejects it.
      linux_here=$(wsl -d "$distro" --exec wslpath -u "$(cygpath -w "$here")" 2>/dev/null | tr -d '\0\r')
      if [[ $linux_here == /* ]]; then
        # stdin is already consumed by the guard above; the WSL run gets none.
        wsl -d "$distro" --exec bash "$linux_here/$self_name" </dev/null
        exit $?
      fi
    fi
    ;; # WSL unusable: fall through and check with the native node, if any.
esac

command -v node >/dev/null 2>&1 || exit 0
cd -- "$here/../.." || exit 0

tmp=$(mktemp -d) || exit 0
trap 'rm -rf -- "$tmp"' EXIT
log="$tmp/log"

# Prints the header and the log, capped at MAX_LINES lines, to stderr; exits 2.
fail() {
  { echo "stop-check: $1"; cat -- "$log"; } | head -n "$MAX_LINES" >&2
  exit 2
}

if ! find "${CHECK_DIRS[@]}" -type f \( -name '*.mjs' -o -name '*.js' \) -print0 >"$tmp/files" 2>>"$log"; then
  fail "cannot list ${CHECK_DIRS[*]}"
fi
bad=0
while IFS= read -r -d '' f; do
  node --check "$f" >>"$log" 2>&1 || bad=1
done < <(sort -z "$tmp/files")
((bad)) && fail "node --check failed"

node "$CLI" build --config "$CONFIG" --out "$tmp/smoke.svg" >>"$log" 2>&1 \
  || fail "smoke build of $CONFIG failed (node $CLI build, exit $?)"
for card in $CARD_CONFIGS; do
  [ -f "$card" ] || continue # the glob matched nothing
  node "$CLI" build --config "$card" --out "$tmp/example.svg" >>"$log" 2>&1 \
    || fail "smoke build of $card failed (node $CLI build, exit $?)"
done
exit 0
