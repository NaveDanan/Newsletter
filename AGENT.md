# Project agent instructions

## MMEMS cluster images

Whenever using `$mmems-cluster-images` for this project, use this image tag format:

```text
<VERSION_NUM>-nightly-<ddmmyyyy>-<HH-mm>-<COMMIT_NUM>
```

- `VERSION_NUM` is the actual app release version, such as `1.0.28` or `1.0.29`.
- The date is eight digits in day-month-year order, without internal separators, matching the requested example.
- Use UTC and a 24-hour, zero-padded `HH-mm` time.
- `COMMIT_NUM` is the seven-character Git commit hash of the committed source used to build the image.

Example for version `1.0.28`, 15 November 2026 at 09:30 UTC, commit `dc7e819`:

```text
1.0.28-nightly-15112026-09-30-dc7e819
```

For app version `1.0.29`, the same example becomes `1.0.29-nightly-15112026-09-30-dc7e819`.

Push every cluster image to `artifactory.rafael.co.il/mems-docker-local-ww/danan/<image>:<tag>` before deploying it. Use `imagePullSecrets: [{name: nave-pull-secret}]` and the `$mmems-cluster-images` procedure. Published tags are immutable. If the required tag already exists, reuse it only after verifying it matches the intended image; otherwise build with the next minute's tag. Do not add another suffix or overwrite an existing tag.

These rules apply to future cluster releases. Keep the current deployed tag unchanged until a new release is requested.

## Production image export

`$whiting-image` prepares the same image currently deployed on MMEMS for offline transfer on `D-M-NAVED-ND`. Its local Docker tag and archive filename use only the formal version, such as `newsletter:1.0.28` and `newsletter-1.0.28.tar`. Pin the deployed registry digest so the exported application matches the running version.

Save the archive in the directory targeted by `C:\Users\NAVED\Desktop\כונן הלבנה.lnk`. Resolve the shortcut; keep the `.lnk` file intact. Formal version-only export tags are not used for MMEMS deployments.
