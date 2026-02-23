#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
PAIR_FILE="$ROOT_DIR/opencore-pairity/test-pairs.tsv"

opencode_dir="${OPENCODE_DIR:-}"

usage() {
  cat <<'EOF'
Usage:
  test-coverage.sh [--opencode-dir <path>]

Checks:
  - every required OpenCode parity target has a row in test-pairs.tsv
  - every ported buddy test exists
  - every mapped OpenCode test exists
  - no deferred rows are present
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
  echo "Missing test pair file: $PAIR_FILE" >&2
  exit 2
fi

required_targets=(
  "packages/opencode/test/agent/agent.test.ts"
  "packages/opencode/test/permission/next.test.ts"
  "packages/opencode/test/permission/arity.test.ts"
  "packages/opencode/test/permission-task.test.ts"
  "packages/opencode/test/session/compaction.test.ts"
  "packages/opencode/test/session/instruction.test.ts"
  "packages/opencode/test/session/llm.test.ts"
  "packages/opencode/test/session/message-v2.test.ts"
  "packages/opencode/test/session/prompt.test.ts"
  "packages/opencode/test/session/retry.test.ts"
  "packages/opencode/test/session/session.test.ts"
  "packages/opencode/test/tool/read.test.ts"
  "packages/opencode/test/tool/write.test.ts"
  "packages/opencode/test/tool/webfetch.test.ts"
  "packages/opencode/test/tool/truncation.test.ts"
  "packages/opencode/test/tool/registry.test.ts"
  "packages/opencode/test/tool/bash.test.ts"
  "packages/opencode/test/tool/grep.test.ts"
  "packages/opencode/test/tool/edit.test.ts"
  "packages/opencode/test/tool/apply_patch.test.ts"
  "packages/opencode/test/tool/external-directory.test.ts"
  "packages/opencode/test/patch/patch.test.ts"
  "packages/opencode/test/config/config.test.ts"
  "packages/opencode/test/config/markdown.test.ts"
  "packages/opencode/test/project/project.test.ts"
  "packages/opencode/test/project/worktree-remove.test.ts"
  "packages/opencode/test/server/session-list.test.ts"
  "packages/opencode/test/server/session-select.test.ts"
  "packages/opencode/test/server/global-session-list.test.ts"
  "packages/opencode/test/storage/json-migration.test.ts"
)

while IFS= read -r app_test; do
  required_targets+=("${app_test#"$opencode_dir/"}")
done < <(find "$opencode_dir/packages/app/src" -type f -name '*.test.ts' | sort)

tmp_targets="$(mktemp)"
tmp_missing="$(mktemp)"
tmp_deferred="$(mktemp)"
trap 'rm -f "$tmp_targets" "$tmp_missing" "$tmp_deferred"' EXIT

awk -F'\t' '
  NF >= 5 && substr($1,1,1) != "#" {
    print $2
  }
' "$PAIR_FILE" | sort -u > "$tmp_targets"

for target in "${required_targets[@]}"; do
  if ! grep -qx "$target" "$tmp_targets"; then
    echo "$target" >> "$tmp_missing"
  fi
done

rows=0
ported=0
na=0
deferred=0
invalid=0
missing_buddy=0
missing_opencode=0

while IFS=$'\t' read -r buddy_path opencode_path surface status reason; do
  [[ -z "${buddy_path:-}" ]] && continue
  [[ "${buddy_path:0:1}" == "#" ]] && continue
  rows=$((rows + 1))

  if [[ "$status" != "ported" && "$status" != "na" && "$status" != "deferred" ]]; then
    invalid=$((invalid + 1))
    echo "INVALID_STATUS: $buddy_path -> $opencode_path ($status)"
  fi

  if [[ "$status" == "ported" ]]; then
    ported=$((ported + 1))
    if [[ "$buddy_path" == "-" || ! -f "$ROOT_DIR/$buddy_path" ]]; then
      missing_buddy=$((missing_buddy + 1))
      echo "MISSING_PORTED_BUDDY_TEST: $buddy_path"
    fi
  elif [[ "$status" == "na" ]]; then
    na=$((na + 1))
  elif [[ "$status" == "deferred" ]]; then
    deferred=$((deferred + 1))
    echo "$buddy_path -> $opencode_path : $reason" >> "$tmp_deferred"
  fi

  if [[ ! -f "$opencode_dir/$opencode_path" ]]; then
    missing_opencode=$((missing_opencode + 1))
    echo "MISSING_OPENCODE_TEST: $opencode_path"
  fi
done < "$PAIR_FILE"

echo "OpenCore Pairity test coverage"
echo "  buddy:    $ROOT_DIR"
echo "  opencode: $opencode_dir"
echo
echo "Summary: rows=$rows ported=$ported na=$na deferred=$deferred invalid=$invalid"
echo "Checks: missing_required=$(wc -l < "$tmp_missing" | tr -d ' ') missing_ported_buddy=$missing_buddy missing_opencode=$missing_opencode"

if [[ -s "$tmp_missing" ]]; then
  echo
  echo "Missing required mapping rows:"
  cat "$tmp_missing"
fi

if [[ -s "$tmp_deferred" ]]; then
  echo
  echo "Deferred mappings are not allowed:"
  cat "$tmp_deferred"
fi

if [[ -s "$tmp_missing" || "$missing_buddy" -gt 0 || "$missing_opencode" -gt 0 || "$deferred" -gt 0 || "$invalid" -gt 0 ]]; then
  exit 1
fi

exit 0
