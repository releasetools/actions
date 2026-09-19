# Prints one version's section of a changelog, between its `## <version>`
# heading and the next one. Shared by the check that refuses an undescribed
# release and the step that turns the same lines into the release notes.

/^## / {
  if (seen) exit
  h = $2
  gsub(/^\[|\]$/, "", h)
  sub(/^v/, "", h)
  if (h == v) seen = 1
  next
}
seen { print }
