# GitLab -> GitHub Mirroring

This repo is configured so GitHub mirrors GitLab as the source of truth automatically.

## How it works (True Mirror)

GitHub Actions workflow:

- `.github/workflows/gitlab-mirror.yml`
- Runs every ~15 minutes and can be triggered manually.
- Clones GitLab as a **bare mirror** and runs `git push --mirror` into GitHub.
- Result: all refs (branches + tags) on GitHub are kept identical to GitLab, including deletions/rewrites.

## Setup (one time)

1. Create a GitHub token with repository write access.
   - Fine-grained PAT: grant access to this repo with `Contents: Read and write`.
   - Classic PAT: `repo` scope is sufficient.

2. Add the token as a GitHub Actions secret:
   - Name: `GH_MIRROR_TOKEN`

## Notes / Warnings

- This will overwrite GitHub branches/tags to match GitLab. If you need GitHub-only changes, do them on GitLab or use GitHub branches that GitLab also owns.
- If a branch is deleted on GitLab, it will be deleted on GitHub on the next mirror run.
