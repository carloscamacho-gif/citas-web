$ErrorActionPreference = 'Stop'
# Activa la red de verificación local de citas-web (pre-commit: escaneo de secretos + lint + pruebas + build).
git config core.hooksPath .githooks
Write-Output 'Hooks de citas-web configurados (core.hooksPath = .githooks).'
