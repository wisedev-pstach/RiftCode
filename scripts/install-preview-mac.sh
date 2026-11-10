#!/bin/bash
# Standalone preview only. Never invoke the main-branch installers.
# Keep all execution inside main so a truncated streamed download cannot start it.
set -euo pipefail
main() {
  local ref='feat/terminal-ai-workspace'
  if [[ $# -gt 0 ]]; then
    if [[ $# -ne 2 || "$1" != '--ref' ]]; then
      printf 'Usage: bash install-preview-mac.sh [--ref FULL_COMMIT_SHA]\n' >&2; return 1
    fi
    ref="$2"
  fi
  if [[ "$ref" != 'feat/terminal-ai-workspace' && ! "$ref" =~ ^[0-9a-f]{40}$ ]]; then
    printf 'Ref must be feat/terminal-ai-workspace or an exact 40-character lowercase commit SHA.\n' >&2; return 1
  fi
  if [[ "$(uname -s)" != Darwin ]]; then printf 'This preview requires macOS.\n' >&2; return 1; fi
  local tool
  for tool in git node npm mktemp; do
    if ! command -v "$tool" >/dev/null 2>&1; then printf 'Missing prerequisite: %s\n' "$tool" >&2; return 1; fi
  done
  node -e 'if (+process.versions.node.split(".")[0] < 24) { console.error("Node.js 24 or newer is required"); process.exit(1); }'
  local temporary_root work checkout actual
  temporary_root="$(cd -P -- "${TMPDIR:-/tmp}" && pwd -P)"
  [[ "$temporary_root" = /* && -d "$temporary_root" ]] || return 1
  work="$(mktemp -d "$temporary_root/rift-preview.XXXXXXXX")"
  readonly work
  local cleanup
  printf -v cleanup 'rm -rf -- %q' "$work"
  trap "$cleanup" EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  checkout="$work/source"
  # Disable credential prompts, helpers, hooks and inherited repository context.
  unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_CONFIG_PARAMETERS
  export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_COUNT=0 GIT_TERMINAL_PROMPT=0
  git -c credential.helper= -c core.hooksPath=/dev/null init -q "$checkout"
  git -C "$checkout" -c credential.helper= -c core.hooksPath=/dev/null remote add origin https://github.com/wisedev-pstach/RiftCode.git
  git -C "$checkout" -c credential.helper= -c core.hooksPath=/dev/null fetch --depth=1 origin "$ref"
  actual="$(git -C "$checkout" rev-parse --verify 'FETCH_HEAD^{commit}')"
  if [[ ! "$actual" =~ ^[0-9a-f]{40}$ || ( "$ref" != 'feat/terminal-ai-workspace' && "$actual" != "$ref" ) ]]; then
    printf 'Fetched source did not match the requested commit.\n' >&2; return 1
  fi
  git -C "$checkout" -c core.hooksPath=/dev/null checkout -q --detach "$actual"
  [[ "$(git -C "$checkout" rev-parse HEAD)" == "$actual" ]] || return 1
  printf 'Building Rift 0.8 preview from %s (%s)\n' "$ref" "$actual"
  cd -- "$checkout"
  node -e 'const p=require("./package.json"); if(p.name!=="rift" || !/^0\.8\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(p.version)) throw Error("Expected Rift 0.8 source"); if(p.build?.beforePack!=="build/before-pack.cjs") throw Error("Expected reviewed native-prebuild packaging hook");'
  # Preserve node-pty shipped prebuilds. Never run its compiler/install scripts.
  npm ci --ignore-scripts --no-audit --no-fund
  # Electron itself requires this explicit download after ignored lifecycle scripts.
  node node_modules/electron/install.js
  npm run package:mac
  node scripts/preview-deploy-mac.cjs "$checkout"
}
main "$@"
