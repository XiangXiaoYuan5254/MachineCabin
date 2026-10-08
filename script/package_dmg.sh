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

# 发布版用 Developer ID 证书签名（开启 hardened runtime），再交给 Apple 公证并贴上票据，下载的用户第一次打开
# 就不会被 Gatekeeper 拦下。钥匙串里没有这张证书时退回临时签名、跳过公证，只适合自己用。
DEVELOPER_ID="Developer ID Application: Li Ming wang (46AL7LQ9T8)"
SIGN_IDENTITY="${MACHINECABIN_SIGN_IDENTITY:-}"
if [[ -z "$SIGN_IDENTITY" ]]; then
  if /usr/bin/security find-identity -v -p codesigning | grep -qF "\"$DEVELOPER_ID\""; then
    SIGN_IDENTITY="$DEVELOPER_ID"
  else
    SIGN_IDENTITY="-"
  fi
fi
# 公证凭据：xcrun notarytool store-credentials helloxxy-notary（存在登录钥匙串里）
NOTARY_PROFILE="${MACHINECABIN_NOTARY_PROFILE:-helloxxy-notary}"

# notarize <要上传的文件> <贴票据的文件>：交给 Apple 公证（几分钟，期间别让 Mac 锁屏，否则读不到凭据）
notarize() {
  local result
  result="$(/usr/bin/xcrun notarytool submit "$1" --keychain-profile "$NOTARY_PROFILE" --wait --output-format json)"
  if [[ "$(/usr/bin/plutil -extract status raw -o - - <<<"$result")" != "Accepted" ]]; then
    echo "公证没有通过：$result" >&2
    echo "查看原因：xcrun notarytool log <id> --keychain-profile $NOTARY_PROFILE" >&2
    exit 1
  fi
  /usr/bin/xcrun stapler staple -q "$2"
}

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
if [[ "$SIGN_IDENTITY" == "-" ]]; then
  echo "提示：钥匙串里没有 $DEVELOPER_ID，使用临时签名、不公证，下载的用户首次打开会被 Gatekeeper 拦下。" >&2
  /usr/bin/codesign --force --deep --sign - --identifier "$BUNDLE_ID" "$DMG_ROOT/$DISPLAY_NAME.app" >/dev/null
else
  /usr/bin/codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" --identifier "$BUNDLE_ID" "$DMG_ROOT/$DISPLAY_NAME.app"
  /usr/bin/codesign --verify --deep --strict "$DMG_ROOT/$DISPLAY_NAME.app"
  NOTARY_ZIP="$RELEASE_DIR/notarize-$APP_NAME.zip"
  rm -f "$NOTARY_ZIP"
  /usr/bin/ditto -c -k --keepParent "$DMG_ROOT/$DISPLAY_NAME.app" "$NOTARY_ZIP"
  notarize "$NOTARY_ZIP" "$DMG_ROOT/$DISPLAY_NAME.app"
  rm -f "$NOTARY_ZIP"
  # 打包用的 Mac 可能关掉了 Gatekeeper，那样 spctl 什么都放行，所以只认来源是否为已公证的 Developer ID
  /usr/sbin/spctl -a -vv -t exec "$DMG_ROOT/$DISPLAY_NAME.app" 2>&1 | grep -q "source=Notarized Developer ID" || {
    echo "$DISPLAY_NAME.app 没有公证上" >&2
    exit 1
  }
fi
ln -s /Applications "$DMG_ROOT/Applications"

/usr/bin/hdiutil create \
  -volname "$DISPLAY_NAME $VERSION" \
  -srcfolder "$DMG_ROOT" \
  -fs HFS+ \
  -format UDZO \
  -imagekey zlib-level=9 \
  -ov "$DMG_PATH" >/dev/null
rm -rf "$DMG_ROOT"
if [[ "$SIGN_IDENTITY" != "-" ]]; then
  /usr/bin/codesign --force --timestamp --sign "$SIGN_IDENTITY" "$DMG_PATH"
  notarize "$DMG_PATH" "$DMG_PATH"
fi

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
