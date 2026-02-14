#!/bin/sh

set -e

function w_log {
    if [[ "$1" == "var" ]]; then
        echo "\033[1;37m[$F_WORKSPACE_BASENAME] $2\033[0m"
    elif [[ "$1" == "info" ]]; then
        echo "\033[0;36m[$F_WORKSPACE_BASENAME] $2\033[0m"
    elif [[ "$1" == "start" ]]; then
        echo "\033[0;36m[$F_WORKSPACE_BASENAME] $2 ...\033[0m"
    elif [[ "$1" == "notice" ]]; then
        echo "\n\033[0;36m[$F_WORKSPACE_BASENAME] NOTICE: $2 ...\033[0m\n"
    elif [[ "$1" == "success" ]]; then
        echo "\033[0;32m[$F_WORKSPACE_BASENAME] $2\033[0m"
    elif [[ "$1" == "error" ]]; then
        echo "\033[0;31m[$F_WORKSPACE_BASENAME] $2\033[0m" >&2
    fi
}

function initWorkspace {

    #${COMMANDS}

}


if [ -z "$F_WORKSPACE_DIR" ]; then
    w_log "error" "ERROR: 'F_WORKSPACE_DIR' env var not set!"
else

    if [ -z "$F_WORKSPACE_BASENAME" ]; then
        export F_WORKSPACE_BASENAME="$(basename "${F_WORKSPACE_DIR}")"
    fi

    initWorkspace ${@:1}
fi

set +e
