#!/usr/bin/env bash
# Fails when two migrations share a version, or when a pull request adds a
# migration that sorts before the newest one on the base branch. Supabase
# tracks migrations by version, so production would skip or refuse either.
set -euo pipefail

base="${1:-}"
dir=supabase/migrations

names=$(find "$dir" -maxdepth 1 -name '*.sql' -exec basename {} \; | sort)
bad=$(printf '%s\n' "$names" | grep -vE '^[0-9]{14}_.+\.sql$' || true)
if [ -n "$bad" ]; then
  echo "::error::Migration names must be <14-digit version>_<name>.sql (use supabase migration new): $bad"
  exit 1
fi

dupes=$(printf '%s\n' "$names" | cut -d_ -f1 | uniq -d)
if [ -n "$dupes" ]; then
  echo "::error::Duplicate migration versions: $dupes. Rename the newer file with supabase migration new."
  exit 1
fi

[ -n "$base" ] || exit 0

latest=$(git ls-tree --name-only "$base" "$dir/" | grep -E '\.sql$' | sed 's|.*/||' | cut -d_ -f1 | sort | tail -n 1)
status=0
while read -r change path; do
  [ -n "$path" ] || continue
  version=$(basename "$path" | cut -d_ -f1)
  case "$change" in
    A)
      if [ -n "$latest" ] && [[ "$version" < "$latest" || "$version" == "$latest" ]]; then
        echo "::error file=$path::$version sorts before $latest, the newest migration on the base branch. Recreate it with supabase migration new."
        status=1
      fi ;;
    M|D)
      echo "::warning file=$path::Changing or removing a migration that may already be applied does not change production. Add a new migration instead." ;;
  esac
done < <(git diff --no-renames --name-status "$base" HEAD -- "$dir")
exit "$status"
