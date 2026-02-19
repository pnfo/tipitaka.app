#!/bin/bash

# Get the absolute path to the script's directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Change the current working directory to the script's directory
cd "$SCRIPT_DIR"

# Got linux and windows cross compiler toolchains from here
# brew tap messense/macos-cross-toolchains
# brew install x86_64-unknown-linux-gnu

# brew install mingw-w64


# The name of your Go program (without the .go extension)
PROGRAM_NAME="tipitaka_app"
export CGO_ENABLED=1

# Platforms and architectures to build for
# By default build for intel since intel version usually works on arm too in mac/windows
PLATFORMS=(
    "linux/amd64/linux_intel/x86_64-unknown-linux-gnu-gcc"
    ####"linux/arm64/linux_arm"
    "darwin/amd64/macos_intel/"
    "darwin/arm64/macos_m1m2/"
    "windows/amd64/windows_intel/x86_64-w64-mingw32-gcc"
    ####"windows/arm64/windows_arm/"
    "windows/386/windows_32bit/i686-w64-mingw32-gcc"  # Windows 32-bit
)

# Iterate over each platform
for PLATFORM in "${PLATFORMS[@]}"
do
    # Split the platform into OS and ARCH
    IFS="/" read -r GOOS GOARCH BINARYNAME CC <<< "$PLATFORM"

    if [[ -n "$CC" ]]; then  # Check if the string is not empty
        CC="CC=${CC}"
    fi

    # Construct the output binary name
    OUTPUT_NAME="${PROGRAM_NAME}_${BINARYNAME}"
    if [ "$GOOS" == "windows" ]; then
        OUTPUT_NAME+=".exe"
    fi

    # Set environment variables, disable cgo and build
    env $CC GOOS=$GOOS GOARCH=$GOARCH go build -o bin/$OUTPUT_NAME

    echo "Built for $PLATFORM: $OUTPUT_NAME $CC"
done

# after building run 1) sign-notorize.sh for mac and 2) create_zips.sh releases for windows/linux