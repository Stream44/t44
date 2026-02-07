#!/usr/bin/env bash

# Used by '@workspace.foundation/t44' dependent packages.

set -e

# Create .workspace/bin directory
mkdir -p .workspace/bin

# Symlink activate binary
ln -sf ../../node_modules/@workspace.foundation/t44/bin/activate .workspace/bin/activate

# Symlink shell binary
ln -sf ../../node_modules/@workspace.foundation/t44/bin/shell .workspace/bin/shell

# Symlink workspace binary
ln -sf ../../node_modules/@workspace.foundation/t44/bin/workspace .workspace/bin/workspace

echo "Workspace binaries symlinked successfully"
