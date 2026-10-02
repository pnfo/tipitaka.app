# source scripts/go-env.sh - macOS: build cgo (sqlite) with the Xcode SDK when the Command Line Tools linker
# does not understand the installed SDK ("tapi error: malformed file").
if [ "$(uname)" = "Darwin" ] && [ -d /Applications/Xcode.app ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
  SDK=$(xcrun --sdk macosx --show-sdk-path)
  export SDKROOT=$SDK CC="$(xcrun -f clang)" CGO_CFLAGS="-isysroot $SDK" CGO_LDFLAGS="-isysroot $SDK"
fi
