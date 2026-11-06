#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
# npm may install a source archive without Git metadata.
if [ ! -e .git ]; then
  exit 0
fi

current_hooks=$(git config --get core.hooksPath || true)
if [ -n "$current_hooks" ] && [ "$current_hooks" != '.githooks' ]; then
  echo "Existing core.hooksPath configuration: $current_hooks" >&2
  echo 'Integrate the existing hooks before installing .githooks.' >&2
  exit 1
fi
if [ -z "$current_hooks" ] && [ -x "$(git rev-parse --git-path hooks/pre-commit)" ]; then
  echo 'An active pre-commit hook already exists; integrate it first.' >&2
  exit 1
fi

chmod +x .githooks/pre-commit
git config --local core.hooksPath .githooks
echo 'Local pre-commit tests enabled / Pruebas pre-commit locales activadas.'
