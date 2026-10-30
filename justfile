set shell := ["bash", "-euo", "pipefail", "-c"]

data_root := env_var("HOME") / "Library/Application Support"
backup_root := env_var("HOME") / "AutoMono-backups"
bundle := "src-tauri/target/release/bundle/macos/AutoMono.app"

default:
    @just --list

# Full app with hot reload
dev:
    bun run tauri dev

# Release .app bundle
build:
    bun run tauri build

test:
    bun run test
    cd src-tauri && cargo test

lint:
    bun run lint
    cd src-tauri && cargo clippy

fmt:
    bun run format
    cd src-tauri && cargo fmt

# Set the version everywhere it lives: just bump 1.2.0
bump version:
    sed -i '' -E '1,/"version"/ s/"version": "[^"]+"/"version": "{{version}}"/' package.json
    sed -i '' -E '1,/"version"/ s/"version": "[^"]+"/"version": "{{version}}"/' src-tauri/tauri.conf.json
    sed -i '' -E '1,/^version = / s/^version = ".*"/version = "{{version}}"/' src-tauri/Cargo.toml
    cd src-tauri && cargo update -p automono --offline -q
    @rg -n '"version"|^version' package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml | rg -v 'version = "2"'

# Copy every AutoMono data folder to ~/AutoMono-backups/<timestamp> (quit the app first)
backup:
    #!/usr/bin/env bash
    set -euo pipefail
    if pgrep -xq AutoMono; then echo "Quit AutoMono first so the database isn't mid-write."; exit 1; fi
    dest="{{backup_root}}/$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$dest"
    shopt -s nullglob
    for dir in "{{data_root}}"/com.*.automono; do
        ditto "$dir" "$dest/$(basename "$dir")"
        diff -rq "$dir" "$dest/$(basename "$dir")" >/dev/null
        echo "Backed up $(basename "$dir") ($(du -sh "$dir" | cut -f1)) -> $dest"
    done

# Back up, build, and replace /Applications/AutoMono.app
install: backup build
    rm -rf /Applications/AutoMono.app
    ditto "{{bundle}}" /Applications/AutoMono.app
    @echo "Installed $(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' /Applications/AutoMono.app/Contents/Info.plist)"
