# Google archive: project account and Drive-folder intake

The double-exposure tool runs in the browser. The Google program supplies base photographs and saves participant originals, completed JPEGs, consent, and duplicate checks. It runs on Google's infrastructure; you do not rent a server or connect a Google account to an AI assistant.

## Current status — October 30, 2026

The user chose the dedicated account **aaron.double.exposure.project@gmail.com** so they can add base photos by dragging files into Google Drive. The new [Apps Script project](https://script.google.com/home/projects/1gj7CIChAW6rMFOmP_Pb16TWSAwUKzZQxnOUOvvEUvDFOwQxKo65lYols/edit) exists in that account. Its manifest is visible, and these Script Properties have been configured:

| Property | Current value |
| --- | --- |
| `PROJECT_OWNER_EMAIL` | `aaron.double.exposure.project@gmail.com` |
| `SITE_URL` | `https://aaronlinguini.github.io/double-exposure-online-project/` |
| `UPLOADS_PAUSED` | `true` |
| `ALLOWED_ORIGINS` | `http://127.0.0.1:5500,http://localhost:5500` |

**The initial five files were installed in the new account's “Photo archive” project and verified byte for byte against that release's tested local files after reloading.** Drive v3 and Sheets v4 appear in Services. The initial release passed **247 automated checks**, including folder discovery without the import API, read-only source boundaries, metadata caching, batched index writes, legacy schema migration, and stable retries. The user manually approved the new-account Google permissions. **`setupProject` completed successfully on October 30, 2026, at 2:18:51 PM**, creating the project's folders and index. **The user then explicitly approved deployment, and Version 1 deployed successfully at 2:27 PM**, executing as **aaron.double.exposure.project@gmail.com** with **Anyone** access.

The new [Google web app](https://script.google.com/macros/s/AKfycbyzIdwIui57NUjmTMm_XyNMvWNHZixo4UyMedoRtz7Qod4COqvjAbcwGDQounUvsCPv/exec) is configured in `project-config.js` and published. Only that configuration file changed in public GitHub commit [`0cde36215db2df0da80c0570bfb82db217ca3959`](https://github.com/aaronlinguini/double-exposure-online-project/commit/0cde36215db2df0da80c0570bfb82db217ca3959). [GitHub Pages run 41107291539](https://github.com/aaronlinguini/double-exposure-online-project/actions/runs/41107291539) **completed successfully**. The publication checks passed **8/8**, and the published tree contains exactly the nine approved files, with no backend, docs, secrets, or private photographs.

The optional [owner page](https://script.google.com/macros/s/AKfycbyzIdwIui57NUjmTMm_XyNMvWNHZixo4UyMedoRtz7Qod4COqvjAbcwGDQounUvsCPv/exec?view=artist) reported **Collection ready** and correct new folder links before photos were added. A real Chrome Incognito visit denied owner-page access with **Open the artist import page while signed into the account that deployed this project.** The user has since dragged base photos into Drive. A live folder listing showed **accidentalselfie.jpeg (16.7 MB)** and **balcony.jpeg (47.8 MB)**. Neither file is currently a usable base. The owner-editor refresh at **3:10:49–3:11:01 PM** returned **artistCount=0, skipped=2, complete=true**. It reported accidentalselfie.jpeg as **CONTENT_TYPE_MISMATCH** (17,501,532 bytes, declared `image/jpeg`, unrecognized content signature) and balcony.jpeg as **IMAGE_TOO_LARGE** (50,164,826 bytes). The first file's actual format is not established by that result; do not guess it. Both need supported, smaller JPEG exports below 30 MB before real participant tests. Neither user file was changed. **Visitor submissions remain paused.** The tested backend was installed and verified by read-back. The folder/consent/deduplication and owner-diagnostic revision passes **270/270 automated checks** and **deployed successfully as Version 3 on October 30 at 3:25 PM**. It keeps the same `/exec` URL, executing account, Anyone access, and OAuth scopes. No frontend or public website files changed. Version 1 and local checkpoint `23fad50` preserve rollback. **Real participant completion, consent-based moves, duplicate reuse, another-pairing, and device checks remain pending.** Do not wait at the earlier warning, repeat initial setup, clear working IDs, or create another initial deployment.

The user can now drag chosen base photos directly into the new [My_photos folder](https://drive.google.com/drive/folders/1KTwgNyGgTgv8HwT1MrBaJeWk-JJIupKY), while signed into **aaron.double.exposure.project@gmail.com**. These are the new project-account archive links:

| Project item | Link |
| --- | --- |
| Root folder | [Double_exposure_web_project (app)](https://drive.google.com/drive/folders/10BU2Di0YgAwW_fJ79Z0kDDq3_zBue1hY) |
| Artist bases and consented participant bases | [My_photos](https://drive.google.com/drive/folders/1KTwgNyGgTgv8HwT1MrBaJeWk-JJIupKY) |
| Private pending/nonconsenting originals | [participant_uploads](https://drive.google.com/drive/folders/1-ZpZKBP9NGF-ODqRxA6OdWBtabEmgwph) |
| Finished exposures | [Completed_double_exposures](https://drive.google.com/drive/folders/1pzaRs9SiFmCR8aXMeCLUhFkhXiItKisM) |
| Index | [Double exposure index](https://docs.google.com/spreadsheets/d/12jxnBQ1yels6UGYMQ_KB-uVuE8UULyMgx7ZX28XZ-JQ/edit) |

The [public website](https://aaronlinguini.github.io/double-exposure-online-project/) and [public repository](https://github.com/aaronlinguini/double-exposure-online-project) now use the new project-account endpoint. The earlier personal-account deployment and its folders remain unchanged and paused as a rollback reference. Distinct new-account installation, folder-link, and deployment records are saved privately in the Git-ignored `secrets/` directory.

There is no need to share a personal Drive folder for this setup. All project folders have been created in the dedicated account, and the user can drag photos into that account's **My_photos** folder. The optional import page is available as a fallback; it is not required for normal photo intake in this version.

## Keep the two Google projects separate

- The new project-account program is deployed and connected. Its own archive folders and index exist; preserve their saved IDs and deployment URL.
- The older [personal-account project](https://script.google.com/home/projects/1wDfc-rqQgk1T-TJYM3vSWkhLnQ5Hl31CTXs_Jl-DgVpdbbcaX9QO7Q14/edit) and [Version 1 endpoint](https://script.google.com/macros/s/AKfycbw89JT4EFAoXcpYM3M8ywS3LSF2jsAUOr3Pc5SlNls-BG_S128SweTPooYdDuPnbuM2/exec) are retained. Do not install the broader-read manifest into that personal-account project.
- Do not copy the old personal-account `EXPOSURE_*_ID` values into the new project. They refer to the old archive and do not transfer ownership or app authorization.
- Setup has created the new project's IDs: **keep them**. Do not repeat the old manual-folder migration or clear working IDs; that would create another archive.
- Pre-install personal-account files and properties are in the Git-ignored `secrets/google-before-limited-access-2026-10-30/`. Earlier archive links and deployment details in `secrets/` describe the old personal-account deployment; the new project-account folder links above are the current archive.

## Permissions in the project account

The revised manifest requests:

| Scope | Purpose |
| --- | --- |
| `https://www.googleapis.com/auth/drive.readonly` | Read photos placed directly into the configured Drive folder |
| `https://www.googleapis.com/auth/drive.file` | Create and update the app's own archive files, folders, and index spreadsheet |
| `https://www.googleapis.com/auth/userinfo.email` | Verify the executing project account and owner operations |
| `https://www.googleapis.com/auth/script.external_request` | Download source-image bytes from Google's fixed Drive API endpoint |

**`drive.readonly` can view and download all Drive files accessible to the project account.** It is not a Google-enforced restriction to one folder. The separate account keeps unrelated personal files outside that grant unless they are shared with it. The code narrows artist reads to supported images directly inside the configured base-photo folder, and checks membership again around each download.

There is no account-wide Drive write/delete scope and no account-wide Sheets write scope. Archive writes still require app-created, app-authorized files carrying the private project marker. The source reader cannot create, move, rename, or delete artist photos. Sheets operations use Advanced Sheets with access to the app's own index. Google access tokens stay server-side; the browser receives photo data and result confirmations, not those tokens.

Before setup or any project read, the backend verifies that its effective Google account matches the required `PROJECT_OWNER_EMAIL`. Owner tools also check the signed-in caller. The broader-read version belongs in the dedicated project account.

Google references: [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes), [advanced services](https://developers.google.com/apps-script/guides/services/advanced).

## One-time Google setup reference

**This account's installation, authorization, setup, deployment, and public endpoint switch are already complete. Continue with base photographs and the live workflow checks, not another initial setup.** The steps below are retained for a fresh project or a deliberate later repair. Installing and editing code does not itself grant OAuth permissions.

1. Save the current five Google project files: **Code.gs**, **Storage.gs**, **Bridge.html**, **Artist.html**, and **appsscript.json**. Their local source is in `google-apps-script/`. Keep JavaScript and CSS external to the HTML; leave the `__...__` replacement markers intact.
2. Verify **Drive API v3** and **Google Sheets API v4** appear in Services. The manifest declares both. A default Apps Script Cloud project normally enables the corresponding APIs with these services; a custom Cloud project may require enabling them in its own console.
3. Keep the four Script Properties in the status table above. No old archive IDs need to be entered into this fresh project.
4. While signed into **aaron.double.exposure.project@gmail.com**, select **setupProject** in the function selector and run it. Review and approve Google's request yourself if you accept it. The consent account must be the project account. Google may display an unverified-app notice; the assistant does not approve or bypass it for you.
5. Wait for **Execution completed**. Run setup again if authorization interrupted the first attempt. The log prints links to the newly created folders and index; repeated successful setup reuses the saved IDs.

Default archive layout, entirely in the project account:

```text
Double_exposure_web_project (app)
├── My_photos
├── participant_uploads
├── Completed_double_exposures
└── Double exposure index
```

The index contains **Sources**, **Submissions**, and **Usage** tabs. Setup does not make these files public.

The consent-folder revision uses the existing folders as follows:

- **My_photos** holds the artist's base photographs and participant originals that have an explicit opt-in and a completed result. A participant file moves here once and keeps a stable numbered name such as **participant_photo_1.jpg**; no additional image copy is created.
- **participant_uploads** privately archives originals that are pending or were submitted without future-use consent. Consent concerns future pairings, not whether the artist retains the original upload.
- **Completed_double_exposures** holds completed JPEGs. Identical results from separate submissions, retries, or tests reuse one file; the index can record several exposures referring to that same file. Finished exposures never enter the base-photo pool.

If a participant submits a byte-identical copy of an artist base already in `My_photos`, the existing artist file is reused and keeps its name and location. A folder scan preserves participant provenance and consent; a filename alone never grants consent.

## Add and manage base photographs in Google Drive

Use the new project-account folder links above:

1. Open **My_photos** in the dedicated account's Google Drive.
2. Drag or upload the chosen base photos directly into that folder. The program reads JPEG, PNG, WebP, and AVIF files up to 30 MB each. Export HEIC or RAW files first.
3. Keep photos directly inside **My_photos**. This reader does not recurse through subfolders or follow Drive shortcuts.

No import app or scheduled trigger is needed for normal use. With visitor uploads enabled, the program checks for folder changes when the site connects and before a new pairing. A completed scan is reused for up to one minute. Reload the site or use Retry after adding photographs. While visitor uploads are paused, run **refreshArtistCollection** in the project account's Apps Script editor to check the collection; the optional owner page can also check it.

Owner refresh diagnostics report at most **50** file issues using private metadata such as the filename, declared/detected type, size, and a bounded reason code. They do not include image bytes, access tokens, or file IDs, and are not returned to visitor requests. These diagnostics distinguish unsupported content and oversize files from successful intake.

Each scan reads at most **10 new or changed images** and **64 MiB** of their data. Large additions progress across later requests rather than downloading the whole folder at once. Files with unchanged modification time, size, and type reuse their recorded hashes. The program is not an always-running folder watcher: without site or owner requests, it does not scan in the background.

Byte-identical artist photos get only one eligible source-pool entry. Duplicate index records retain their metadata so later scans do not download them again. The program does not delete duplicate files that the user placed in Drive. Moving or deleting a base photo makes it ineligible after the next successful scan; already saved results remain archived. If a photo changes or disappears after it was assigned to a pending exposure, the pinned checksum prevents a retry from silently substituting different image content.

Base photos can be supplied to visitors for random pairings even though the Drive folders remain private. Photos displayed on future gallery pages are a separate selection; adding a base does not create a gallery page.

The optional `/exec?view=artist` page is still owner-only. Its upload control works only for an app-owned artist folder; direct Drive-folder management is the intended workflow. The folder can later be changed to an explicitly shared source folder accessible to the project account, but that is not required for this setup.

## Deployment and publication reference

**The current project is already deployed and connected at the new URL above. Keep that deployment; do not create another one for initial setup.** The instructions below are for a fresh project or a deliberate endpoint change.

After the new setup succeeds, create a **Web app** deployment in the new account:

- **Execute as:** Me, the project account.
- **Who has access:** Anyone, so visitors can use the service without Google sign-in.

This publishes the submission service, not the Drive folders or index. The artist page and artist RPCs separately verify the owner. Review the actual deployment settings before publishing. Copy the deployed URL ending in **`/exec`**, not the editor-only `/dev` test URL.

Then set `googleScriptUrl` in `project-config.js` to that new `/exec` URL. Preserve `forceBlackAndWhite` and the connection timeouts. Rebuild the public package with:

```sh
node scripts/prepare-public-site.cjs
```

Publish only the generated `.public-site/` contents to GitHub Pages. The approved release still has nine public files:

- `index.html`, `styles.css`, `scripts.js`, `project-config.js`
- `archive-workflow.js`, `drive-storage.js`, `drive-bridge.js`
- `artist-import.js`, `artist-import.css`

Do not publish the working repository, its history, `google-apps-script/`, docs, tests, secrets, local experiments, or private photos. The two optional owner-page assets contain no credentials. Future home/gallery pages and selected public images must be added deliberately to the publication allowlist; never publish every project file automatically.

Keep `SITE_URL` as the HTTPS repository base, including its path and trailing slash, even if the double-exposure tool later moves to its own page. Google loads the external bridge and optional artist assets from that base. Local HTTP previews need their exact origins in `ALLOWED_ORIGINS`; `file://` cannot connect to the archive.

## Verify before opening visitor submissions

Keep `UPLOADS_PAUSED=true` until the new account, archive, base photos, deployment, and website endpoint are ready. Add at least two distinct bases to test another pairing. Then set it to **false** for the live check:

1. Confirm new photos dropped into **My_photos** become eligible without using the import upload control. Check duplicate files and a later folder addition. The first scan may need several requests for a large batch.
2. Open the public site in a genuinely signed-out/private browser. Submit a different photo with future reuse unchecked. Wait for **Double exposure saved**.
3. Verify its exact original in **participant_uploads**, its JPEG in **Completed_double_exposures**, and a completed row with `allowReuse=false`. The participant source must remain ineligible for future pairings.
4. Submit another photo with future reuse checked. After its result is saved, confirm that the original **moves** from `participant_uploads` into `My_photos`, gets a stable **participant_photo_N.ext** name, and joins future pairings. Confirm that its original file ID is unchanged and no second image copy exists. Random selection does not guarantee it is selected immediately.
5. Reuse the same original, upload a renamed identical file, and test **Try another pairing**. Confirm one original across both source folders, stable numbering, and avoidance of the immediately previous base. Repeat with an artist photo already in `My_photos`; no participant copy or artist rename should result. Repeat an identical finished JPEG across separate test submissions; both records must refer to one completed file.
6. Retry an interrupted save. Confirm stable submission/base/result identity. A changed or removed assigned artist photo must fail clearly rather than silently replace the base.
7. Verify `/exec?view=artist` denies signed-out and different-account visitors while the project owner can use it. Do not treat another signed-in browser as an anonymous test.
8. Test library selection, camera capture, cancellation, and portrait input on actual phones/tablets. Desktop layout tests do not prove camera-picker or HEIC-conversion behavior.

Do not describe the real archive workflow as tested until these checks pass. If preparation stops, keep or restore `UPLOADS_PAUSED=true`.

## Archive behavior and later updates

Participant originals keep the exact bytes supplied by their device's picker. The consent-folder revision computes SHA-256 on the server before saving. Identical original files reuse a verified existing artist or participant source; changing a filename does not make a new photo. Identical completed JPEGs reuse one result file across submissions and tests. Recovery must also reuse a file created immediately before an interrupted index write. A request that would duplicate an image across source/result roles fails without saving another copy.

This identity check covers identical file bytes. Cropping, resizing, re-exporting, changing embedded metadata, or camera-picker conversion can change those bytes; detecting every visually similar version cannot be guaranteed by exact hashing. The program does not trust a browser-supplied fingerprint to substitute a different archived original. Copies manually created by dragging the same file into Drive are detected and receive only one eligible pool entry, but are not silently deleted. No broader Drive write permission is added for cleanup.

Finished exposures never join the source pool. A participant original joins `My_photos` only after explicit opt-in and a saved completed result, and it moves rather than being copied. The archive retains pending/nonconsenting originals privately in `participant_uploads`. The stable `participant_photo_N.ext` name identifies participant files for the artist, while private provenance and completed consent control eligibility. The number comes from the original source row, so gaps are normal; do not renumber the files or sort/delete index rows to change it. `INCLUDE_PARTICIPANT_PHOTOS=false` disables participant bases while retaining their files.

Retry saving keeps the same submission and assigned base in the open browser session. Keep that tab open until completion; closing it can leave a saved original without a finished result. The new **Sources** schema has nine columns, adding `modifiedAt`; **Submissions** has sixteen, adding `baseSha256`. Existing compatible indexes gain those fields, and earlier assigned bases are pinned before inventory changes. Do not manually edit source hashes, consent, submission tokens, or the Usage ledger.

The public image treatment remains **Saved Current, contrast 12, 0/0 EV**. `forceBlackAndWhite` in `project-config.js` controls finished monochrome output; archived originals retain their supplied colour and orientation. Local experimental sliders are separate from the public page.

Later backend edits require saving the Google files and deploying a new version through **Manage deployments → Edit → New version**. Keeping the deployment preserves its `/exec` address. Frontend edits publish through GitHub Pages. A local file edit does not update either service automatically.

The pre-revision direct-folder deployment is retained as **Version 1** in Google, with its local files and connection at checkpoint **`23fad50`**. To roll back this revision, restore the preserved local files and select the existing Google deployment's Version 1; neither action alone changes the other environment. The old import-page implementation is retained at local commit **`6e966b3`**. Earlier checkpoints remain in Git, including **`before-limited-drive-access`** at **`f458bb2`**. Restoring local files does not switch a deployed Google version, republish GitHub Pages, or revoke an OAuth grant.

## Intake and storage limits

Optional Script Properties control visitor intake:

| Property | Default | Effect |
| --- | --- | --- |
| `REQUESTS_PER_MINUTE` | `120` | Global visitor API attempts per fixed UTC minute, including retries and connection checks |
| `SUBMISSIONS_PER_DAY` | `200` | New visitor submissions per UTC day, including another pairing; retries reuse their submission |
| `UPLOAD_BYTES_PER_DAY` | `1073741824` | Newly saved visitor original/result bytes per UTC day; duplicates and recovered files are not charged again |
| `UPLOADS_PAUSED` | `false` | Set true to close visitor requests while keeping owner setup/checks available |

The daily byte allowance is adjustable; it is not a 1 GB total archive limit or a change to the Google storage plan. Counters reset at midnight UTC. A limit can pause completion after an original is saved; its retry can finish after the allowance resets or is raised. Limits contain global usage, not per-person fairness or every possible form of abuse. The private Usage ledger reserves writes before saving files, and unused older reservations must fit the current day's allowance. Abandoned attempts can conservatively consume allowance; malformed limits or accounting close visitor uploads until corrected.

The project account's storage and Google service quotas still apply. Public results use up to 2,400 pixels on the longest edge and JPEG uploads up to 12 MB. Large collections and sustained traffic need a real load check. Google Sheets also has per-user API quotas, so bounded image reads alone do not establish a supported collection or visitor capacity.

Google references: [web apps](https://developers.google.com/apps-script/guides/web), [authorization](https://developers.google.com/apps-script/guides/services/authorization), [HTML-service RPC](https://developers.google.com/apps-script/guides/html/communication), [external assets](https://developers.google.com/apps-script/guides/html/restrictions), [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas), [Sheets quotas](https://developers.google.com/workspace/sheets/api/limits).
