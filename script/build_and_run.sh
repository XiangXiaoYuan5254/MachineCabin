#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="MachineCabin"
DISPLAY_NAME="机舱"
BUNDLE_ID="com.xxy.machinecabin"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE_DIR="$ROOT_DIR/build/macos"
APP_BUNDLE="$STAGE_DIR/$DISPLAY_NAME.app"
APP_CONTENTS="$APP_BUNDLE/Contents"
APP_MACOS="$APP_CONTENTS/MacOS"
APP_RESOURCES="$APP_CONTENTS/Resources"
APP_BINARY="$APP_MACOS/$APP_NAME"
WEB_RESOURCES="$APP_RESOURCES/web"
ICON_MASTER="$STAGE_DIR/MachineCabin-1024.png"
ICONSET="$STAGE_DIR/MachineCabin.iconset"

if [[ "$MODE" != "build" && "$MODE" != "--build" ]]; then
  pkill -x "$APP_NAME" >/dev/null 2>&1 || true
fi

cd "$ROOT_DIR"

# App 用 package.json 的版本号检查更新，Info.plist 必须和它一致，否则会误报或漏报新版本。
PACKAGE_VERSION="$(node -p "require('./package.json').version")"
PLIST_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$ROOT_DIR/macapp/Info.plist")"
if [[ "$PACKAGE_VERSION" != "$PLIST_VERSION" ]]; then
  echo "版本号不一致：package.json 是 $PACKAGE_VERSION，macapp/Info.plist 是 $PLIST_VERSION，请改成一致后再构建。" >&2
  exit 1
fi

npm run build
swift build -c release
BUILD_BINARY="$(swift build -c release --show-bin-path)/$APP_NAME"

rm -rf "$APP_BUNDLE" "$ICONSET"
mkdir -p "$APP_MACOS" "$APP_RESOURCES" "$WEB_RESOURCES" "$ICONSET"
cp "$BUILD_BINARY" "$APP_BINARY"
chmod +x "$APP_BINARY"
cp "$ROOT_DIR/macapp/Info.plist" "$APP_CONTENTS/Info.plist"

/usr/bin/ditto "$ROOT_DIR/dist" "$WEB_RESOURCES/dist"
/usr/bin/ditto "$ROOT_DIR/server" "$WEB_RESOURCES/server"
cp "$ROOT_DIR/package.json" "$ROOT_DIR/package-lock.json" "$WEB_RESOURCES/"
(
  cd "$WEB_RESOURCES"
  npm ci --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null
)

mkdir -p "$APP_RESOURCES/default-data"
if [[ -f "$ROOT_DIR/.vbcoding/services.json" ]]; then
  cp "$ROOT_DIR/.vbcoding/services.json" "$APP_RESOURCES/default-data/services.json"
fi

swift "$ROOT_DIR/script/generate_icon.swift" "$ICON_MASTER"
for size in 16 32 128 256 512; do
  /usr/bin/sips -z "$size" "$size" "$ICON_MASTER" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double_size=$((size * 2))
  /usr/bin/sips -z "$double_size" "$double_size" "$ICON_MASTER" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
/usr/bin/iconutil -c icns "$ICONSET" -o "$APP_RESOURCES/MachineCabin.icns"
/usr/bin/codesign --force --deep --sign - --identifier "$BUNDLE_ID" "$APP_BUNDLE" >/dev/null

open_app() {
  /usr/bin/open -n "$APP_BUNDLE"
}

install_app() {
  local install_bundle="/Applications/$DISPLAY_NAME.app"
  local support_dir="$HOME/Library/Application Support/$DISPLAY_NAME"
  if [[ -e "$install_bundle" ]]; then
    rm -rf "$install_bundle"
  fi
  /usr/bin/ditto "$APP_BUNDLE" "$install_bundle"
  mkdir -p "$support_dir"
  if [[ ! -f "$support_dir/services.json" && -f "$ROOT_DIR/.vbcoding/services.json" ]]; then
    cp "$ROOT_DIR/.vbcoding/services.json" "$support_dir/services.json"
  fi
  /usr/bin/open -n "$install_bundle"
}

case "$MODE" in
  --build|build)
    echo "Built $APP_BUNDLE"
    ;;
  run)
    open_app
    ;;
  --install|install)
    install_app
    ;;
  --debug|debug)
    lldb -- "$APP_BINARY"
    ;;
  --logs|logs)
    open_app
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
    ;;
  --telemetry|telemetry)
    open_app
    /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\""
    ;;
  --verify|verify)
    open_app
    sleep 2
    pgrep -x "$APP_NAME" >/dev/null
    ;;
  *)
    echo "usage: $0 [run|--build|--install|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac
