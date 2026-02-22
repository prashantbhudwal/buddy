#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
PAIR_FILE="$ROOT_DIR/opencore-pairity/pairs.tsv"

opencode_dir="${OPENCODE_DIR:-}"
max_count=5
since_ref=""

usage() {
  cat <<'EOF'
Usage:
  upstream-history.sh [--opencode-dir <path>] [--max-count <n>] [--since <ref>]

Options:
  --opencode-dir <path>  Explicit path to OpenCode repo
  --max-count <n>        Max commits per file when --since is not provided (default: 5)
  --since <ref>          Show commits in range <ref>..HEAD
  -h, --help             Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --opencode-dir)
      opencode_dir="${2:-}"
      shift 2
      ;;
    --max-count)
      max_count="${2:-}"
      shift 2
      ;;
    --since)
      since_ref="${2:-}"
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

echo "OpenCore Pairity upstream history"
echo "  opencode: $opencode_dir"
if [[ -n "$since_ref" ]]; then
  echo "  range:    $since_ref..HEAD"
else
  echo "  max:      $max_count commits per file"
fi
echo

while IFS= read -r rel_path; do
  abs_path="$opencode_dir/$rel_path"
  echo "== $rel_path =="

  if [[ ! -f "$abs_path" ]]; then
    echo "  missing in OpenCode: $rel_path"
    echo
    continue
  fi

  if [[ -n "$since_ref" ]]; then
    git -C "$opencode_dir" --no-pager log --oneline "${since_ref}..HEAD" -- "$rel_path" | sed 's/^/  /'
  else
    git -C "$opencode_dir" --no-pager log --oneline --max-count "$max_count" -- "$rel_path" | sed 's/^/  /'
  fi
  echo
done < <(
  awk -F'\t' 'NF > 1 && substr($1,1,1) != "#" { print $2 }' "$PAIR_FILE" | sort -u
)
