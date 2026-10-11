#!/usr/bin/env bash
set -euo pipefail

# This script cross-builds a Windows EXE installer from a 64-bit Linux host.

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "This cross-build command requires 64-bit Linux." >&2
  exit 1
fi

# Node/npm are often installed via nvm and not on a fresh shell's PATH. If npm is
# missing, locate an existing nvm-installed Node bin dir and prepend it so this
# script runs without the caller having to export PATH first. Handles both of the
# common layouts:
#   ~/.nvm/versions/node/<ver>/bin        (nvm's default)
#   ~/.local/share/nvm/<ver>/bin          (used on some distro-managed nvm installs)
if ! command -v npm >/dev/null 2>&1; then
  node_bin=""
  for nvm_root in "$HOME/.nvm" "$HOME/.local/share/nvm"; do
    [[ -d "$nvm_root" ]] || continue
    node_bin="$(find "$nvm_root" -type d -name bin -exec test -x '{}/node' \; -print 2>/dev/null | sort -V | tail -n 1)"
    [[ -n "$node_bin" ]] && break
  done
  if [[ -n "$node_bin" ]]; then
    export PATH="$node_bin:$PATH"
  fi
fi

# github.com/electron is unreachable from some networks (e.g. this one), which breaks
# the Electron binary + electron-builder tool downloads. Default to the npmmirror.com
# mirrors; either can be overridden by setting the env var before invoking this script.
export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
export ELECTRON_BUILDER_BINARIES_MIRROR="${ELECTRON_BUILDER_BINARIES_MIRROR:-https://npmmirror.com/mirrors/electron-builder-binaries/}"

for required_command in npm npx tar find mktemp; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Missing required command: $required_command" >&2
    exit 1
  fi
done

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "$project_root/package.json" ]]; then
  echo "package.json was not found at: $project_root" >&2
  echo "Put this file in your project's Scripts folder, then run it again." >&2
  exit 1
fi

stage_root="$(mktemp -d "${TMPDIR:-/tmp}/depot-manager-exe.XXXXXX")"
stage_project="$stage_root/project"

cleanup() {
  rm -rf -- "$stage_root"
}
trap cleanup EXIT INT TERM

mkdir -p "$stage_project"

# Build in a disposable copy. Windows native modules never overwrite the
# Linux development copy in project_root/node_modules.
(
  cd "$project_root"
  tar \
    --exclude='./node_modules' \
    --exclude='./dist' \
    --exclude='./.git' \
    --exclude='./tests' \
    --exclude='./data/*.sqlite*' \
    -cf - .
) | tar -xf - -C "$stage_project"

(
  cd "$stage_project"

  npm ci

  # Reuse the project's existing Windows native module preparation when it exists.
  # Depot Management uses the Node built-in node:sqlite (no native modules), so
  # there is normally nothing to prebuild; the hook stays for future modules.
  prebuild_win="$(npm pkg get scripts.prebuild:win)"

  if [[ -n "$prebuild_win" && "$prebuild_win" != "null" && "$prebuild_win" != "{}" ]]; then
    npm run prebuild:win
  fi

  build_args=(
    --win nsis
    --x64
    --publish never
  )

  # Optional NSIS installer behavior.
  # These are reasonable defaults for a normal desktop EXE installer.
  build_args+=(
    --config.nsis.oneClick=false
    --config.nsis.allowToChangeInstallationDirectory=true
    --config.nsis.createDesktopShortcut=true
  )

  npx electron-builder "${build_args[@]}"
)

mkdir -p "$project_root/dist"

artifact_count=0
while IFS= read -r -d '' artifact; do
  cp -f -- "$artifact" "$project_root/dist/"
  artifact_count=$((artifact_count + 1))
done < <(find "$stage_project/dist" -maxdepth 1 -type f -iname '*.exe' -print0)

if [[ "$artifact_count" -eq 0 ]]; then
  echo "The staged build completed but no EXE installer was found." >&2
  exit 1
fi

echo
echo "EXE package created without changing Linux node_modules:"
find "$project_root/dist" -maxdepth 1 -type f -iname '*.exe' -print
echo
echo "Important:"
echo "- For public website downloads, the EXE should be signed with a trusted Windows code-signing certificate."
echo "- An unsigned EXE may trigger Windows SmartScreen warnings."
