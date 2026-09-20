# Executor response format

Edit the existing `reviews/RV-nnn/response.json`. Keep schema_version, review_id and author_role as provided. Obtain request_sha256 with `node tools/reviews.js --hash reviews/RV-nnn/request.json` after reading the complete current request.

A completed finding uses this shape; replace illustrative values with actual evidence:

```json
{
  "id": "V-001",
  "status": "addressed",
  "summary": "Describe the correction and observed result.",
  "changed_paths": ["game/src/domain/combat_resolver.gd"],
  "evidence": [
    {
      "command": "godot --headless --path game --script res://tests/run_tests.gd",
      "environment": "Actual terminal/OS; exact engine version; local laptop or remote",
      "checked_at": "2026-09-20T19:00:00Z",
      "exit_code": 0,
      "result": "passed",
      "artifact": "reviews/RV-001/evidence/combat.log",
      "sha256": "REPLACE_WITH_ACTUAL_64_CHARACTER_SHA256"
    }
  ]
}
```

This is a format illustration, not a real passing test. For an image, use the actual capture command, image artifact path and image hash. For a manual review, put observed review details in a committed Markdown artifact; result observation does not assert human approval unless actually obtained. For failed commands preserve the nonzero exit and result failed. A finding blocked by missing access stays blocked with a precise summary; the overall response stays draft.

When all findings are addressed, set top-level state to ready_for_review, implementation_commit to the full SHA of the tested code commit, and summary to a concise description. Evidence-only commits may follow the implementation commit. Keep changed_paths relative to runtime-zero; prefix exceptional repository-root changes with `repo:` to make the scope explicit. Evidence artifacts must be available inside runtime-zero, including small downloaded copies of externally stored proof if needed for hash verification.

Run `node tools/verify.js`. This checks record integrity, not semantic acceptance. Commit/push the response and evidence and await the validator. Keep verdict.json unchanged.

The validator computes `node tools/reviews.js --hash reviews/RV-nnn/response.json` only after reviewing the submission and binds its verdict to that exact response, request and implementation commit. Changing the response or its evidence invalidates that acceptance until reviewed again.
