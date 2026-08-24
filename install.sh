#!/bin/sh

set -eu

if [ "$(uname -s)" != "Darwin" ]; then
  echo "install.sh currently supports macOS. On Windows, run install.ps1." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 24 or newer is required." >&2
  exit 1
fi

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DESTINATION="$HOME/Applications/Rift.app"
CLI_DESTINATION="$HOME/.local/bin/rift"

cd "$ROOT"
npm ci
npm run package:mac

PACKAGED_APP=""
for candidate in "$ROOT"/dist/mac*/Rift.app; do
  if [ -d "$candidate" ]; then
    PACKAGED_APP=$candidate
    break
  fi
done

if [ -z "$PACKAGED_APP" ]; then
  echo "The packaged Rift.app was not found in $ROOT/dist." >&2
  exit 1
fi

mkdir -p "$(dirname "$APP_DESTINATION")" "$(dirname "$CLI_DESTINATION")"
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
echo "Ensure $HOME/.local/bin is on PATH."
