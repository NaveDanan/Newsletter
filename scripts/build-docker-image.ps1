param(
  [string]$ImageName = 'newsletter:latest',
  [string]$PocketBaseDir = 'C:\Users\naved\Downloads\pocketbase_0.36.9_linux_amd64'
)

$ErrorActionPreference = 'Stop'

docker build `
  --build-context "pocketbase-dist=$PocketBaseDir" `
  --tag $ImageName `
  .