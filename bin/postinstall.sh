#!/usr/bin/env bash

# Used by 't44' dependent packages.

set -e

# Create .workspace/bin directory
mkdir -p .workspace/bin

# Symlink activate binary
ln -sf ../../node_modules/t44/bin/activate .workspace/bin/activate

# Symlink shell binary
ln -sf ../../node_modules/t44/bin/shell .workspace/bin/shell

# Symlink workspace binary
ln -sf ../../node_modules/t44/bin/t44 .workspace/bin/t44

echo "Workspace binaries symlinked successfully"
