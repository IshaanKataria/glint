#!/bin/sh
# Builds the Vision OCR helper into native/ocr/bin/glint-ocr. Glint also runs this
# automatically (src/ocr/index.ts) when the binary is missing or older than the source.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$here/bin"
swiftc -O -o "$here/bin/glint-ocr" "$here/glint_ocr.swift"
echo "built $here/bin/glint-ocr"
