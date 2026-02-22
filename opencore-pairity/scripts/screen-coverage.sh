#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
PAIR_FILE="$ROOT_DIR/opencore-pairity/pairs.tsv"

opencode_dir="${OPENCODE_DIR:-}"

usage() {
  cat <<'EOF'
Usage:
  screen-coverage.sh [--opencode-dir <path>]

Purpose:
  Methodically screen Buddy core files against OpenCode counterparts and flag
  parity coverage gaps in pairs.tsv.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --opencode-dir)
      opencode_dir="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$opencode_dir" ]]; then
  if [[ -d "$HOME/code/opencode" ]]; then
    opencode_dir="$HOME/code/opencode"
  elif [[ -d "$HOME/Code/opencode" ]]; then
    opencode_dir="$HOME/Code/opencode"
  fi
fi

if [[ -z "$opencode_dir" || ! -d "$opencode_dir" ]]; then
  echo "OpenCode repository not found." >&2
  echo "Set OPENCODE_DIR or pass --opencode-dir <path>." >&2
  exit 2
fi

if [[ ! -f "$PAIR_FILE" ]]; then
  echo "Missing pair file: $PAIR_FILE" >&2
  exit 2
fi

tmp_pairs="$(mktemp)"
tmp_buddy="$(mktemp)"
trap 'rm -f "$tmp_pairs" "$tmp_buddy"' EXIT

awk -F'\t' 'NF > 1 && substr($1,1,1) != "#" { print $1 "\t" $2 }' "$PAIR_FILE" | sort > "$tmp_pairs"
find "$ROOT_DIR/packages/buddy/src" -type f -name '*.ts' \
  | sed "s#^$ROOT_DIR/##" \
  | sort > "$tmp_buddy"

echo "OpenCore Pairity coverage screen"
echo "  buddy:    $ROOT_DIR"
echo "  opencode: $opencode_dir"
echo

exact_total=0
exact_mapped=0
exact_unmapped=0

echo "[1/2] Exact-path counterpart screening"
while IFS= read -r buddy_path; do
  rel="${buddy_path#packages/buddy/src/}"
  opencode_path="packages/opencode/src/$rel"
  if [[ ! -f "$opencode_dir/$opencode_path" ]]; then
    continue
  fi
  exact_total=$((exact_total + 1))
  if grep -q "^$buddy_path"$'\t'"$opencode_path$" "$tmp_pairs"; then
    exact_mapped=$((exact_mapped + 1))
    continue
  fi
  exact_unmapped=$((exact_unmapped + 1))
  echo "UNMAPPED_EXACT: $buddy_path -> $opencode_path"
done < "$tmp_buddy"

echo
echo "Exact summary: total=$exact_total mapped=$exact_mapped unmapped=$exact_unmapped"
echo

echo "[2/2] Known rename counterpart screening"
known_unmapped=0
known_total=0
while IFS='|' read -r buddy_path opencode_path reason; do
  [[ -z "${buddy_path:-}" ]] && continue
  known_total=$((known_total + 1))

  if [[ ! -f "$ROOT_DIR/$buddy_path" ]]; then
    echo "MISSING_BUDDY: $buddy_path"
    continue
  fi
  if [[ ! -f "$opencode_dir/$opencode_path" ]]; then
    echo "MISSING_OPENCODE: $opencode_path"
    continue
  fi

  if grep -q "^$buddy_path"$'\t'"$opencode_path$" "$tmp_pairs"; then
    echo "MAPPED_RENAME: $buddy_path -> $opencode_path ($reason)"
  else
    known_unmapped=$((known_unmapped + 1))
    echo "UNMAPPED_RENAME: $buddy_path -> $opencode_path ($reason)"
  fi
done <<'EOF'
packages/buddy/src/routes/global.ts|packages/opencode/src/server/routes/global.ts|routes namespace differs
packages/buddy/src/routes/session.ts|packages/opencode/src/server/routes/session.ts|routes namespace differs
packages/buddy/src/routes/config.ts|packages/opencode/src/server/routes/config.ts|routes namespace differs
packages/buddy/src/routes/permission.ts|packages/opencode/src/server/routes/permission.ts|routes namespace differs
packages/buddy/src/tool/list.ts|packages/opencode/src/tool/ls.ts|OpenCode uses ls.ts filename
packages/buddy/src/session/system-prompt.ts|packages/opencode/src/session/system.ts|Buddy renamed system prompt module
packages/buddy/src/storage/global.ts|packages/opencode/src/global/index.ts|global path module moved in Buddy
packages/buddy/src/session/message-v2/index.ts|packages/opencode/src/session/message-v2.ts|Buddy split message-v2 into multiple files
EOF

echo
echo "Rename summary: total=$known_total unmapped=$known_unmapped"

if [[ "$exact_unmapped" -gt 0 || "$known_unmapped" -gt 0 ]]; then
  exit 1
fi
exit 0
