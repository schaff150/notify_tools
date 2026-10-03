# Notify Tools

Node.js notification hub for Jellyfin, Sonarr, Radarr and household announcements.
The production service starts with `npm start` and stores live configuration and
notification history under the mounted `data/` directory.

## Jellyfin notifications

Jellyfin sends arrival events to `/api/webhooks/jellyfin`. The workflow combines
item and parent-series tags, resolves requester tags through `seerr_user_map`,
and notifies only configured `notify_map` recipients. Untagged arrivals do not
send a message; successful submissions are deduplicated in history.

API tag lookups use the `Authorization: MediaBrowser Token="<key>"` header.
Do not move the key back into an `api_key` URL parameter or enable deprecated
server authentication to work around an outdated client.

## Verification and release

- `npm ci --ignore-scripts`
- `npm test` — exercises the production handler and local HTTP protocol, replacing
  only the SMS boundary; it sends no external messages.
- `python -m unittest discover -s tests -p 'test_*.py'` — optional legacy-client
  regressions without requiring Flask or connecting to SMTP.

The image-publishing workflow runs both suites before pushing the image. Images
carry the full Git revision label and an immutable `sha-<commit>` tag. Verify the
image revision before rebuilding the Unraid container from its native template.
Back up live settings first and preserve data, audio, SSH and override mounts.
An update must not clear dedup history or automatically replay missed arrivals.

`.dockerignore` excludes Git metadata, credential files, live settings, personal
history, SSH material and generated dependencies from the build context.

## Optional legacy Python notifier

`jellyfin_notifier.py` is not the Node service's entrypoint. If used separately,
it reads `JELLYFIN_URL`, `JELLYFIN_API_KEY`, `SMTP_SERVER`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS`, `NOTIFY_MAP_JSON` and optional `JELLYFIN_HISTORY_FILE` from external
configuration. Credentials default to empty and personal recipients are not
hardcoded. Keep that configuration outside source control.

Removing a credential from current source does not remove it from older Git
commits or images. Credentials previously committed must be revoked or rotated
with their provider; never put replacement values into source or build inputs.
