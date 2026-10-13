#!/bin/sh
# Construit Setup-GestionRH-Paie.exe (nécessite Go et l'outil rsrc :
#   GOPROXY=direct go install github.com/akavel/rsrc@v0.10.2)
set -e
cd "$(dirname "$0")"
RSRC=${RSRC:-rsrc}
python3 ../src/build.py
mkdir -p setup/payload
cp ../index.html setup/payload/index.html
cp rh.ico setup/payload/rh.ico
$RSRC -manifest app.manifest -ico rh.ico -arch amd64 -o lanceur/rsrc_windows_amd64.syso
$RSRC -manifest app.manifest -ico rh.ico -arch amd64 -o setup/rsrc_windows_amd64.syso
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H windowsgui" -o setup/payload/GestionRH.exe ./lanceur
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H windowsgui" -o ../dist/Setup-GestionRH-Paie.exe ./setup
ls -la ../dist/
