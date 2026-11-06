#!/bin/sh
set -eu

project_root=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
fixture=$(mktemp -d "${TMPDIR:-/tmp}/tech-week-hooks.XXXXXX")
trap 'rm -rf "$fixture"' EXIT HUP INT TERM

# Git exports repository variables when invoking hooks. Do not let them redirect
# the isolated commits below into the actual project.
for git_variable in $(git rev-parse --local-env-vars); do
  unset "$git_variable"
done

mkdir -p "$fixture/repo/.githooks" "$fixture/bin"
cp "$project_root/.githooks/pre-commit" "$fixture/repo/.githooks/pre-commit"
chmod +x "$fixture/repo/.githooks/pre-commit"
cat > "$fixture/bin/npm" <<'STUB'
#!/bin/sh
test "$*" = 'run test:precommit' || exit 99
echo invoked >> "$HOOK_TEST_CALLS"
exit "$HOOK_TEST_EXIT"
STUB
chmod +x "$fixture/bin/npm"
export PATH="$fixture/bin:$PATH"
export HOOK_TEST_CALLS="$fixture/calls"
export HOOK_TEST_EXIT=0

cd "$fixture/repo"
git init -q
git config --local user.name 'Hook test'
git config --local user.email 'hook-test@example.invalid'
git config --local commit.gpgsign false
git config --local core.hooksPath .githooks
git add .githooks/pre-commit

export HOOK_TEST_EXIT=1
if git commit -qm 'must fail' > "$fixture/output" 2>&1; then
  echo 'FAIL: failed tests allowed a commit' >&2
  exit 1
fi
test -s "$HOOK_TEST_CALLS"
if git rev-parse --verify HEAD >/dev/null 2>&1; then
  echo 'FAIL: failed tests created a commit' >&2
  exit 1
fi

export HOOK_TEST_EXIT=0
git commit -qm 'passing tests'
before=$(git rev-parse HEAD)

echo change >> .githooks/pre-commit
rm "$HOOK_TEST_CALLS"
if git commit --allow-empty -qm 'unstaged mismatch' > "$fixture/output" 2>&1; then
  echo 'FAIL: unstaged changes allowed a commit' >&2
  exit 1
fi
test ! -e "$HOOK_TEST_CALLS"
git restore .githooks/pre-commit

echo untracked > pending.txt
if git commit --allow-empty -qm 'untracked mismatch' > "$fixture/output" 2>&1; then
  echo 'FAIL: untracked files allowed a commit' >&2
  exit 1
fi
test ! -e "$HOOK_TEST_CALLS"
test "$(git rev-parse HEAD)" = "$before"
echo 'Hook checks passed: test failure, success, unstaged and untracked changes.'
