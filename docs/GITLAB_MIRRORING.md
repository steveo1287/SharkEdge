# GitLab -> GitHub Mirroring

This repo is configured so GitHub `main` mirrors GitLab `main` automatically.

## How it works

GitHub Actions workflow:

- `.github/workflows/gitlab-mirror.yml`
- Runs every ~15 minutes and can be triggered manually.
- Fetches `main` + tags from GitLab and force-syncs GitHub `main` to match.

## Setup (one time)

1. Create a GitHub token with repository write access.
   - Fine-grained PAT: grant access to this repo with `Contents: Read and write`.
   - Classic PAT: `repo` scope is sufficient.

2. Add the token as a GitHub Actions secret:
   - Name: `GH_MIRROR_TOKEN`

## Notes

- The workflow force-pushes `main` to match GitLab. If you need GitHub-only changes, do them on GitLab or use a separate GitHub branch.
- Tags are also forced into sync.

