#!/bin/sh

set -eu

if [ "$(uname -s)" != "Darwin" ]; then
  echo "install.sh currently supports macOS. On Windows, run install.ps1." >&2
  exit 1
fi

if [ "$(id -u)" -eq 0 ]; then
  echo "Run install.sh as your normal user, not with sudo." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 24 or newer is required." >&2
  exit 1
fi

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DESTINATION="$HOME/Applications/Rift.app"
CLI_DESTINATION="$HOME/.local/bin/rift"

has_foreign_owner() {
  [ -e "$1" ] && [ -n "$(find "$1" ! -user "$(id -u)" -print -quit 2>/dev/null)" ]
}

if has_foreign_owner "$ROOT/node_modules" ||
   has_foreign_owner "$APP_DESTINATION" ||
   has_foreign_owner "$(dirname "$CLI_DESTINATION")"; then
  echo "Files from an earlier sudo install are owned by root." >&2
  echo "Repair them once, then run this installer again:" >&2
  echo "sudo chown -R \"$(id -un):$(id -gn)\" \"$ROOT/node_modules\" \"$APP_DESTINATION\" \"$(dirname "$CLI_DESTINATION")\"" >&2
  exit 1
fi

cd "$ROOT"
npm ci
npm run package:mac

PACKAGED_APP=""
for candidate in "$ROOT"/release/mac*/Rift.app; do
  if [ -d "$candidate" ]; then
    PACKAGED_APP=$candidate
    break
  fi
done

if [ -z "$PACKAGED_APP" ]; then
  echo "The packaged Rift.app was not found in $ROOT/release." >&2
  exit 1
fi

mkdir -p "$(dirname "$APP_DESTINATION")" "$(dirname "$CLI_DESTINATION")"
if [ -d "$APP_DESTINATION" ]; then
  echo "Closing the installed Rift instance..."
  osascript -e 'tell application "Rift" to quit' >/dev/null 2>&1 || true
  sleep 1
  pkill -f "$APP_DESTINATION/Contents/MacOS/Rift" >/dev/null 2>&1 || true
fi
rm -rf "$APP_DESTINATION"
cp -R "$PACKAGED_APP" "$APP_DESTINATION"

cat > "$CLI_DESTINATION" <<'EOF'
#!/bin/sh
set -eu
REPOSITORY=$(CDPATH= cd -- "${1:-.}" && pwd -P)
exec open -a "$HOME/Applications/Rift.app" --args "--repository=$REPOSITORY"
EOF
chmod 755 "$CLI_DESTINATION"

echo "Rift was installed at $APP_DESTINATION"
echo "The rift command was installed at $CLI_DESTINATION"
echo "Existing Rift data is retained; incompatible saved selections are migrated when Rift starts."
echo "Ensure $HOME/.local/bin is on PATH."
