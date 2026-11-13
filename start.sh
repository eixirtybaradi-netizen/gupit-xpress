#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "Gupit Xpress - starting local server"
read -r -s -p "Choose an admin passcode for this session: " ADMIN_PASSCODE
echo
[ -z "$ADMIN_PASSCODE" ] && { echo "A passcode is required."; exit 1; }
export ADMIN_PASSCODE
node server.js
