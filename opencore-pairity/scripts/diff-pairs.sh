#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
PAIR_FILE="$ROOT_DIR/opencore-pairity/pairs.tsv"

show_full=false
changed_only=false
opencode_dir="${OPENCODE_DIR:-}"

usage() {
  cat <<'EOF'
Usage:
  diff-pairs.sh [--opencode-dir <path>] [--full] [--changed-only]

Options:
  --opencode-dir <path>  Explicit path to OpenCode repo
  --full                 Print full diff for changed pairs
  --changed-only         Hide MATCH rows
  -h, --help             Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --opencode-dir)
      opencode_dir="${2:-}"
      shift 2
      ;;
    --full)
      show_full=true
      shift
      ;;
    --changed-only)
      changed_only=true
      shift
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

matches=0
diffs=0
missing=0
rows=0

echo "OpenCore Pairity report"
echo "  buddy:    $ROOT_DIR"
echo "  opencode: $opencode_dir"
echo

while IFS=$'\t' read -r buddy_path opencode_path priority notes; do
  [[ -z "${buddy_path:-}" ]] && continue
  [[ "${buddy_path:0:1}" == "#" ]] && continue

  rows=$((rows + 1))
  buddy_abs="$ROOT_DIR/$buddy_path"
  opencode_abs="$opencode_dir/$opencode_path"

  if [[ ! -f "$buddy_abs" || ! -f "$opencode_abs" ]]; then
    missing=$((missing + 1))
    echo "MISSING [$priority] $buddy_path"
    [[ ! -f "$buddy_abs" ]] && echo "  buddy missing:    $buddy_abs"
    [[ ! -f "$opencode_abs" ]] && echo "  opencode missing: $opencode_abs"
    echo "  note: $notes"
    echo
    continue
  fi

  if cmp -s "$opencode_abs" "$buddy_abs"; then
    matches=$((matches + 1))
    if [[ "$changed_only" == false ]]; then
      echo "MATCH   [$priority] $buddy_path"
      echo "  note: $notes"
      echo
    fi
    continue
  fi

  diffs=$((diffs + 1))
  stat="$(git --no-pager diff --no-index --shortstat -- "$opencode_abs" "$buddy_abs" || true)"
  echo "DIFF    [$priority] $buddy_path"
  echo "  opencode: $opencode_path"
  echo "  note: $notes"
  [[ -n "$stat" ]] && echo "  delta: $stat"
  echo

  if [[ "$show_full" == true ]]; then
    git --no-pager diff --no-index -- "$opencode_abs" "$buddy_abs" || true
    echo
  fi
done < "$PAIR_FILE"

echo "Summary: total=$rows match=$matches diff=$diffs missing=$missing"

if [[ "$missing" -gt 0 ]]; then
  exit 2
fi
if [[ "$diffs" -gt 0 ]]; then
  exit 1
fi
exit 0
