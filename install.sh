#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
target="$HOME/.claude/skills/chalktalk"

command -v bun >/dev/null || { echo "Chalktalk needs Bun: https://bun.sh"; exit 1; }
mkdir -p "$HOME/.claude/skills"
if [ -e "$target" ] && [ ! -L "$target" ]; then
  echo "$target already exists and is not a link; move it away and run this again."
  exit 1
fi
(cd "$here" && bun install --production --silent)
ln -sfn "$here" "$target"
echo "Installed: $target -> $here"
echo "Next: in Claude Code, type /chalktalk listen, then add the bookmark from README.md."
