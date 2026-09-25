#!/usr/bin/env bash
# 把 build/macos/机舱.app 打包成可公开分发的 DMG，并同步到官网的 downloads/ 目录。
# 先运行 ./script/build_and_run.sh 生成 App，再运行本脚本。
set -euo pipefail

DISPLAY_NAME="机舱"
APP_NAME="MachineCabin"
BUNDLE_ID="com.xxy.machinecabin"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_APP="$ROOT_DIR/build/macos/$DISPLAY_NAME.app"
RELEASE_DIR="$ROOT_DIR/build/release"
DMG_ROOT="$RELEASE_DIR/dmg-root"
SITE_DOWNLOADS="$ROOT_DIR/website/downloads"

if [[ ! -d "$SOURCE_APP" ]]; then
  echo "找不到 $SOURCE_APP，请先运行 ./script/build_and_run.sh" >&2
  exit 1
fi

VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$SOURCE_APP/Contents/Info.plist")"
ARCH="$(/usr/bin/lipo -archs "$SOURCE_APP/Contents/MacOS/$APP_NAME")"
DMG_NAME="$APP_NAME-$VERSION.dmg"
DMG_PATH="$RELEASE_DIR/$DMG_NAME"

rm -rf "$DMG_ROOT" "$DMG_PATH"
mkdir -p "$DMG_ROOT" "$SITE_DOWNLOADS"
/usr/bin/ditto "$SOURCE_APP" "$DMG_ROOT/$DISPLAY_NAME.app"

# 公开发布的安装包不能带上开发者本机的服务列表
rm -rf "$DMG_ROOT/$DISPLAY_NAME.app/Contents/Resources/default-data"
/usr/bin/codesign --force --deep --sign - --identifier "$BUNDLE_ID" "$DMG_ROOT/$DISPLAY_NAME.app" >/dev/null
ln -s /Applications "$DMG_ROOT/Applications"

/usr/bin/hdiutil create \
  -volname "$DISPLAY_NAME $VERSION" \
  -srcfolder "$DMG_ROOT" \
  -fs HFS+ \
  -format UDZO \
  -imagekey zlib-level=9 \
  -ov "$DMG_PATH" >/dev/null
rm -rf "$DMG_ROOT"

SIZE="$(stat -f%z "$DMG_PATH")"
SHA256="$(shasum -a 256 "$DMG_PATH" | awk '{print $1}')"

# 官网只保留最新版本，历史版本交给 GitHub Releases
find "$SITE_DOWNLOADS" -name "$APP_NAME-*.dmg" ! -name "$DMG_NAME" -delete
cp "$DMG_PATH" "$SITE_DOWNLOADS/$DMG_NAME"
cat > "$SITE_DOWNLOADS/latest.json" <<JSON
{
  "version": "$VERSION",
  "file": "$DMG_NAME",
  "size": $SIZE,
  "sha256": "$SHA256",
  "arch": "$ARCH",
  "date": "$(date +%Y-%m-%d)"
}
JSON

echo "DMG:     $DMG_PATH"
echo "大小:    $((SIZE / 1024 / 1024)) MB"
echo "SHA-256: $SHA256"
echo "已同步到 website/downloads/，并更新 latest.json"
echo "发布到 GitHub Releases 时请上传同一个文件：$DMG_NAME"
