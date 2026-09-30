#!/usr/bin/env sh
# Escáner de secretos para el pre-commit. Revisa SOLO las líneas que este commit AÑADE (no el historial
# ni las líneas borradas: retirar un secreto siempre está permitido). Nunca imprime el valor encontrado.
# Falso positivo legítimo: agrega "allowlist-secret" en la misma línea.
set -eu

tmp=$(mktemp)
trap 'rm -f "$tmp" "$tmp.f"' EXIT

# "<archivo><TAB><línea añadida>" para cada línea nueva de archivos agregados/copiados/modificados.
git -c core.quotepath=off diff --cached -U0 --no-color --diff-filter=ACM | awk '
  /^\+\+\+ b\// { file = substr($0, 7); next }
  /^\+\+\+ /    { file = ""; next }
  /^\+/         { if (file != "") print file "\t" substr($0, 2) }
' > "$tmp"

# Se ignoran .env.example (plantillas sin secretos reales) y las líneas marcadas como permitidas.
grep -v -E '^([^	]*/)?\.env\.example	' "$tmp" | grep -v 'allowlist-secret' > "$tmp.f" || true

found=0

# rule "descripción" "regex" [-i]   → reporta archivo(s) y regla, jamás el valor.
rule() {
  desc=$1
  regex=$2
  flag=${3:-}
  # "-e" es imprescindible: hay patrones (p. ej. "-----BEGIN ...") que grep confundiría con una opción.
  files=$(grep -E $flag -e "$regex" "$tmp.f" | grep -v -E 'CHANGE_ME|change-me|changeme|your[-_]|<[^>]+>|placeholder|dummy' | cut -f1 | sort -u || true)
  if [ -n "$files" ]; then
    found=1
    printf '  x %s\n' "$desc" >&2
    printf '%s\n' "$files" | sed 's/^/      en: /' >&2
  fi
}

# Archivos de entorno reales: solo se versiona .env.example.
env_files=$(git -c core.quotepath=off diff --cached --name-only --diff-filter=ACM \
  | grep -E '(^|/)\.env($|\.)' | grep -v -E '(^|/)\.env\.example$' || true)
if [ -n "$env_files" ]; then
  found=1
  printf '  x archivo de entorno real (usa .env.example sin valores reales)\n' >&2
  printf '%s\n' "$env_files" | sed 's/^/      en: /' >&2
fi

rule 'token de GitHub'                   'gh[pousr]_[A-Za-z0-9]{20,}'
rule 'token fino de GitHub'              'github_pat_[A-Za-z0-9_]{20,}'
rule 'clave de acceso de AWS'            'AKIA[0-9A-Z]{16}'
rule 'llave privada'                     '-----BEGIN ([A-Z]+ )?PRIVATE KEY-----'
rule 'token de Slack'                    'xox[baprs]-[A-Za-z0-9-]{10,}'
rule 'clave de API de Google'            'AIza[0-9A-Za-z_-]{35}'
rule 'clave estilo OpenAI/Stripe'        '\bsk-[A-Za-z0-9]{32,}'
rule 'credenciales incrustadas en una URL' 'https?://[^/[:space:]:@]+:[^/[:space:]@$]{6,}@'
rule 'valor literal para una variable sensible (JWT/DB/OAuth)' \
  '(JWT_(ACCESS|REFRESH)_SECRET|DB_PASSWORD|MYSQL_(ROOT_)?PASSWORD|OAUTH_CLIENT_SECRET|CLIENT_SECRET|API_KEY|SECRET_KEY)[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9/+_.!*@#%^&-]{8,}' -i

if [ "$found" -ne 0 ]; then
  printf '\nCommit bloqueado: se detecto un posible secreto. Sacalo del commit y usa variables de entorno\n' >&2
  printf '(.env local, no versionado; .env.example solo con placeholders).\n' >&2
  exit 1
fi
