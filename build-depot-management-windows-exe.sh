#!/usr/bin/env bash
set -euo pipefail

# Build a Windows Electron EXE installer from a 64-bit Linux machine.
# Put this script in the Depot-Management. project directory and run:
#   bash build-depot-management-windows-exe.sh
#
# The Linux development tree is never given Windows native node_modules.
# The actual Windows build happens in a temporary staging directory.

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
    echo "This build script requires 64-bit Linux." >&2
    exit 1
fi

# Resolve the project from the directory containing this script.
PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# Allow an explicit project override when the script is stored elsewhere:
#   PROJECT_ROOT=/path/to/Depot-Management. bash build-depot-management-windows-exe.sh
if [[ -n "${PROJECT_ROOT_OVERRIDE:-}" ]]; then
    PROJECT_ROOT="$(cd -- "$PROJECT_ROOT_OVERRIDE" && pwd)"
fi

if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
    echo "package.json was not found in:" >&2
    echo "  $PROJECT_ROOT" >&2
    echo >&2
    echo "Put this script inside the Depot-Management. project directory," >&2
    echo "or set PROJECT_ROOT_OVERRIDE to the project path." >&2
    exit 1
fi

# Node/npm can be installed through nvm and may not be present in a fresh shell PATH.
if ! command -v npm >/dev/null 2>&1; then
    node_bin=""
    for nvm_root in "$HOME/.nvm" "$HOME/.local/share/nvm"; do
        [[ -d "$nvm_root" ]] || continue
        node_bin="$(
            find "$nvm_root" \
                -type d -name bin \
                -exec test -x '{}/node' \; -print 2>/dev/null |
            sort -V |
            tail -n 1
        )"
        [[ -n "$node_bin" ]] && break
    done

    if [[ -n "$node_bin" ]]; then
        export PATH="$node_bin:$PATH"
    fi
fi

for required_command in npm npx tar find mktemp; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
        echo "Missing required command: $required_command" >&2
        exit 1
    fi
done

# Electron/electron-builder downloads can fail on some networks.
# Override these variables before running the script when different mirrors are needed.
export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
export ELECTRON_BUILDER_BINARIES_MIRROR="${ELECTRON_BUILDER_BINARIES_MIRROR:-https://npmmirror.com/mirrors/electron-builder-binaries/}"

STAGE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/depot-management-exe.XXXXXX")"
STAGE_PROJECT="$STAGE_ROOT/project"

cleanup() {
    rm -rf -- "$STAGE_ROOT"
}
trap cleanup EXIT INT TERM

mkdir -p "$STAGE_PROJECT"

echo "Project: $PROJECT_ROOT"
echo "Staging Windows build..."
echo

# Copy the source into a disposable build tree.
# Exclude Linux node_modules, previous build output, git data, and local app data.
(
    cd "$PROJECT_ROOT"
    tar \
        --exclude='./node_modules' \
        --exclude='./dist' \
        --exclude='./.git' \
        --exclude='./out' \
        --exclude='./release' \
        --exclude='./*.sqlite' \
        --exclude='./*.sqlite-*' \
        --exclude='./data' \
        --exclude='./SchoolManagerData' \
        -cf - .
) | tar -xf - -C "$STAGE_PROJECT"

(
    cd "$STAGE_PROJECT"

    echo "Installing project dependencies..."
    if [[ -f package-lock.json || -f npm-shrinkwrap.json ]]; then
        npm ci
    else
        npm install
    fi

    echo
    echo "Building Windows EXE installer..."
    echo

    BUILD_ARGS=(
        --win nsis
        --x64
        --publish never

        # Standard installer behavior.
        --config.nsis.oneClick=false
        --config.nsis.allowToChangeInstallationDirectory=true
        --config.nsis.createDesktopShortcut=true
    )

    # If the project defines prebuild:win, run it before electron-builder.
    PREBUILD_WIN="$(npm pkg get scripts.prebuild:win 2>/dev/null || true)"

    if [[ -n "$PREBUILD_WIN" &&
          "$PREBUILD_WIN" != "null" &&
          "$PREBUILD_WIN" != "{}" &&
          "$PREBUILD_WIN" != '""' ]]; then
        echo "Running project prebuild:win..."
        npm run prebuild:win
        echo
    fi

    # Build only the requested Windows NSIS package.
    npx electron-builder "${BUILD_ARGS[@]}"
)

# Copy only EXE files back to the real project's dist directory.
mkdir -p "$PROJECT_ROOT/dist"

artifact_count=0
while IFS= read -r -d '' artifact; do
    cp -f -- "$artifact" "$PROJECT_ROOT/dist/"
    artifact_count=$((artifact_count + 1))
done < <(
    find "$STAGE_PROJECT/dist" \
        -maxdepth 1 \
        -type f \
        -iname '*.exe' \
        -print0
)

if [[ "$artifact_count" -eq 0 ]]; then
    echo "Build finished, but no .exe installer was found." >&2
    exit 1
fi

echo
echo "Windows EXE build completed successfully."
echo
echo "EXE file(s):"
find "$PROJECT_ROOT/dist" -maxdepth 1 -type f -iname '*.exe' -print
echo
echo "Linux node_modules were not modified."
echo "The Windows build used a temporary staging directory."
