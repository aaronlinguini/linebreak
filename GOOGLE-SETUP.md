# Google archive: project account and Drive-folder intake

The double-exposure tool runs in the browser. The Google program supplies base photographs and saves participant originals, completed JPEGs, consent, and duplicate checks. It runs on Google's infrastructure; you do not rent a server or connect a Google account to an AI assistant.

## Current status — October 30, 2026

The user chose the dedicated account **aaron.double.exposure.project@gmail.com** so they can add base photos by dragging files into Google Drive. The new [Apps Script project](https://script.google.com/home/projects/1gj7CIChAW6rMFOmP_Pb16TWSAwUKzZQxnOUOvvEUvDFOwQxKo65lYols/edit) exists in that account. Its manifest is visible, and these Script Properties have been configured:

| Property | Current value |
| --- | --- |
| `PROJECT_OWNER_EMAIL` | `aaron.double.exposure.project@gmail.com` |
| `SITE_URL` | `https://aaronlinguini.github.io/double-exposure-online-project/` |
| `UPLOADS_PAUSED` | `false` — explicitly approved and saved for live testing |
| `ALLOWED_ORIGINS` | `http://127.0.0.1:5500,http://localhost:5500` |

**Google Version 5 deployed successfully on October 30 at 6:44 PM.** `Code.gs` and `Storage.gs` were installed and verified by exact editor read-back. The [Google web app](https://script.google.com/macros/s/AKfycbyzIdwIui57NUjmTMm_XyNMvWNHZixo4UyMedoRtz7Qod4COqvjAbcwGDQounUvsCPv/exec) keeps the same `/exec` URL configured in `project-config.js`, executing account **aaron.double.exposure.project@gmail.com**, **Anyone** access, OAuth scopes, properties, and archive IDs. That release passed **316/316** local checks before the automatic-development UI revision. The user explicitly approved activating the existing public service for live tests; `UPLOADS_PAUSED=false` was then saved and verified. This activation is separate from publishing the frontend.

**Local Google connection verified:** real bridge and `exposureApi` requests from `http://127.0.0.1:5500` completed in Google's execution log. After Version 5 activation, a Chrome retry and a fresh in-app-browser page both completed bootstrap, cleared the connection status, and enabled the upload, camera, consent, and black-and-white controls. An earlier fresh Chrome attempt timed out; its cause was not established. The visitor bridge JavaScript is served by Google at `/exec?asset=bridge`, so this connection no longer needs GitHub Pages assets. The optional owner page still loads its CSS and JavaScript from `SITE_URL`. Around **9:09 PM on October 30**, the user reported successful manual double-exposure generation. That report is separate from independent checks of archive-folder contents, consent-based moves, duplicate reuse, another pairing, and phone/tablet behaviour; those checks remain pending. Earlier browser automation could not select a local photo because Chrome's automation extension lacked file-URL permission.

**Current local interaction:** set **Black and white** and future-use consent before choosing or taking a photo. Selection freezes both choices and starts development automatically, with no separate Create button or original-photo preview. A photo selected during the initial Google connection waits in the queue and starts when the archive is ready. A centered spinner and **Please wait while your photo is developed.** cover preparation, waiting, rendering, and saving. If the archive is unavailable before submission, **Retry** reconnects and resumes that queued photo, and **Start over** clears the selection. Pending save failures keep the existing retry protections. The result appears only after the matching archive receipt; no separate success message is shown. This UI revision passes **319/319** automated checks. Desktop and phone-width browser checks used a deliberately delayed simulated save to inspect the developing state, without uploading another image to Google. It changes neither the image calculation nor Google Version 5. Local checkpoint **`8069a2c`** preserves the previous interaction.

**Current base collection:** the final owner refresh completed at **7:19:48 PM** with **113 eligible artist bases**, **complete: true**, **0 deferred**, **0 skipped**, and no issues. This includes the smaller replacement exports of accidentalselfie.jpeg and balcony.jpg. The bounded scans progressed through 19, 59, 90, and 112 indexed bases before completing all 113. No user image bytes, names, or folders were changed by the scan.

The last published frontend is the visitor black-and-white release `949dc1`, preserved locally at `76d40d3`. The home/tool/experiment drafts stay local. The GitHub repository is **private**, and the former Pages address is offline with **404: no GitHub Pages site**. No repository files or history were deleted. No frontend publication is authorized; publishing the finished website remains a separate manual step with guidance.

Historical setup: the user approved the dedicated account's Google permissions, and `setupProject` created its folders and index on October 30 at **2:18:51 PM**. Version 1 deployed at **2:27 PM**; Version 3 added the consent-folder/duplicate handling revision at **3:25 PM**; Version 4 added the Google-served bridge; Version 5 added faster base-photo intake. The old **3:10:49–3:11:01 PM** scan's zero-base result concerned two earlier files only: accidentalselfie.jpeg had an unrecognized content signature and balcony.jpeg exceeded 30 MB. Those files were later replaced, so that result does not describe the current collection. The optional owner page previously showed correct folder links, and a real Incognito check denied owner access while signed out. Do not repeat initial authorization/setup, clear working IDs, or create another initial deployment.

The user can now drag chosen base photos directly into the new [My_photos folder](https://drive.google.com/drive/folders/1KTwgNyGgTgv8HwT1MrBaJeWk-JJIupKY), while signed into **aaron.double.exposure.project@gmail.com**. These are the new project-account archive links:

| Project item | Link |
| --- | --- |
| Root folder | [Double_exposure_web_project (app)](https://drive.google.com/drive/folders/10BU2Di0YgAwW_fJ79Z0kDDq3_zBue1hY) |
| Artist bases and consented participant bases | [My_photos](https://drive.google.com/drive/folders/1KTwgNyGgTgv8HwT1MrBaJeWk-JJIupKY) |
| Private pending/nonconsenting originals | [participant_uploads](https://drive.google.com/drive/folders/1-ZpZKBP9NGF-ODqRxA6OdWBtabEmgwph) |
| Finished exposures | [Completed_double_exposures](https://drive.google.com/drive/folders/1pzaRs9SiFmCR8aXMeCLUhFkhXiItKisM) |
| Index | [Double exposure index](https://docs.google.com/spreadsheets/d/12jxnBQ1yels6UGYMQ_KB-uVuE8UULyMgx7ZX28XZ-JQ/edit) |

The [GitHub repository](https://github.com/aaronlinguini/double-exposure-online-project) is private and retains the last published frontend `949dc1`; the former Pages site is offline. Its project-account endpoint configuration is unchanged. The earlier personal-account deployment and its folders remain unchanged and paused as a rollback reference. Distinct new-account installation, folder-link, and deployment records are saved privately in the Git-ignored `secrets/` directory.

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

1. Save the current six Google project files: **Code.gs**, **Storage.gs**, **Client.gs**, **Bridge.html**, **Artist.html**, and **appsscript.json**. Their local source is in `google-apps-script/`. Keep JavaScript and CSS external to the HTML; leave the `__...__` replacement markers intact. `Client.gs` is generated from the canonical `drive-bridge.js`; run `node scripts/build-google-client.cjs` before copying a changed bridge, or use `--check` to verify they match without writing.
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

The deployed faster scan uses Drive's output-only **SHA-256 checksum**, when available, plus a verified media-header read of at most **64 bytes** for new or changed JPEG, PNG, and WebP bases. Fresh metadata before and after the read must agree on checksum, size, type, modification time, version when supplied, parent folders, and download permission. Partial responses must have an exact `Content-Range` and the requested byte count. These checks do not alter the photograph. [Drive file metadata](https://developers.google.com/workspace/drive/api/reference/rest/v3/files), [partial media downloads](https://developers.google.com/workspace/drive/api/guides/manage-downloads).

The scan starts at most **150 header probes** and stops starting further artist reads after **25 seconds**, checking that deadline between files. This limits new requests rather than aborting work already in progress; it does not guarantee a 25-second request duration. Missing or invalid checksums and AVIF use full-file signature and SHA-256 validation, bounded by the existing **10 full reads / 64 MiB** allowance. AVIF stays on that path because its type information may extend beyond 64 bytes. If Drive ignores the range and returns HTTP 200, the program verifies and hashes that already downloaded full body once and counts its actual bytes against the full-read allowance; it does not fetch the file again. Failed full responses and buffered HTTP error bodies also consume that allowance. Unfinished scans resume on later requests, reusing verified unchanged records. A fresh supplied Drive checksum must still match the cached hash, even if size and modification time are unchanged.

The selected photograph is still downloaded completely and checked against its exact stored SHA-256 in `readSource_` before use. New-original intake still refuses to proceed until the collection scan completes. Participant provenance, consent, folder moves, and duplicate handling are unchanged. The program is not an always-running folder watcher: without site or owner requests, it does not scan in the background.

**Fast scan is installed as Version 5.** Google Version 4 and local checkpoint `89746ec` preserve the prior scan for rollback. The current counts and remaining live checks are recorded above. This performance edit changes no image treatment, original retention, consent, duplicate handling, scopes, or archive IDs. Public service activation was separately approved; further pause changes remain the user's choice.

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

Preparation is local only. If publication is explicitly requested later, publish only the generated `.public-site/` contents. The prepared site has thirteen approved files:

- `index.html`, `double-exposure.html`, `experiment-1.html`, `experiment-2.html`, `experiment-3.html`
- `styles.css`, `scripts.js`, `project-config.js`
- `archive-workflow.js`, `drive-storage.js`, `drive-bridge.js`
- `artist-import.js`, `artist-import.css`

Do not publish the working repository, its history, `google-apps-script/`, docs, tests, secrets, local experiments, or private photos. The two optional owner-page assets contain no credentials. Future home/gallery pages and selected public images must be added deliberately to the publication allowlist; never publish every project file automatically.

Keep `SITE_URL` as the HTTPS repository base, including its path and trailing slash. The prepared tool page is `double-exposure.html`; the home page remains `index.html`. This split does not require an Apps Script update. `SITE_URL` supplies the public website's permitted origin and the optional owner-page asset base. Local HTTP previews need their exact origins in `ALLOWED_ORIGINS`; `file://` cannot connect to the archive.

The visitor bridge HTML now points to the same Google deployment's fixed `?asset=bridge` route. That route serves only the generated JavaScript with a JavaScript MIME type; it reads no script properties or Google files and accepts no filename or caller-supplied code. The normal bridge page still checks the website origin, and the JavaScript still checks its top window, channel, message origin, and permitted operations. The route uses [Google's Content Service](https://developers.google.com/apps-script/guides/content), which redirects the static response to a Google content URL. HTML continues to contain only an external script reference.

The bridge repair is already installed and verified in the existing Google project. Its six source files include the generated **Client.gs**. Future changes to the bridge require rebuilding that file, saving the affected Google sources, and updating the existing deployment version while preserving its `/exec` URL, account, Anyone access, permissions, properties, and folder IDs. Do not rerun setup or grant new scopes for this repair.

While GitHub Pages is offline, the optional owner page's external assets remain unavailable. Direct Drive uploads, collection checks in the Apps Script editor, and `local-test.html` remain available. The visitor bridge is verified from an explicitly allowed local HTTP origin while the public website remains offline. **`UPLOADS_PAUSED=true` blocks visitor bootstrap, uploads, and completion**; the current value is **false**, explicitly approved for live testing. Publishing frontend files or changing the service's pause state requires the user's instruction.

## Remaining live workflow checks

The existing Google service is active as explicitly approved, and the frontend remains local. The user has reported successful manual generation; the checks below still need independent archive confirmation. The automated tests, connected bridge, and successful displayed result do not replace the consent, duplicate, and folder checks. Use the local HTTP website. At least two distinct usable bases are required to test another pairing. Do not repeat setup or change the pause setting to begin testing.

1. Confirm new photos dropped into **My_photos** become eligible without using the import upload control. Check duplicate files and a later folder addition. The first scan may need several requests for a large batch.
2. Open `double-exposure.html` from the home page in a genuinely signed-out/private browser. Before choosing a photo, leave future reuse unchecked and set the colour choice. Select a different photo; it develops automatically. Wait for the result image to appear after its matching save receipt, without a success message.
3. Verify its exact original in **participant_uploads**, its JPEG in **Completed_double_exposures**, and a completed row with `allowReuse=false`. The participant source must remain ineligible for future pairings.
4. Start over, check future reuse before selecting another photo, and let it develop automatically. After its result is saved, confirm that the original **moves** from `participant_uploads` into `My_photos`, gets a stable **participant_photo_N.ext** name, and joins future pairings. Confirm that its original file ID is unchanged and no second image copy exists. Random selection does not guarantee it is selected immediately.
5. Reuse the same original, upload a renamed identical file, and test **Pair this image with a different photo**. Confirm one original across both source folders, stable numbering, and avoidance of the immediately previous base. Repeat with an artist photo already in `My_photos`; no participant copy or artist rename should result. Repeat an identical finished JPEG across separate test submissions; both records must refer to one completed file.
6. Retry an interrupted save. Confirm stable submission/base/result identity. A changed or removed assigned artist photo must fail clearly rather than silently replace the base.
7. Verify `/exec?view=artist` denies signed-out and different-account visitors while the project owner can use it. Do not treat another signed-in browser as an anonymous test.
8. Test library selection, camera capture, cancellation, and portrait input on actual phones/tablets. Desktop layout tests do not prove camera-picker or HEIC-conversion behavior.

Do not describe the real archive workflow as tested until these checks pass. If the user wants to close the active service, set `UPLOADS_PAUSED=true` at their request; do not silently change it because a check remains unfinished.

## Archive behavior and later updates

Participant originals keep the exact bytes supplied by their device's picker. The consent-folder revision computes SHA-256 on the server before saving. Identical original files reuse a verified existing artist or participant source; changing a filename does not make a new photo. Identical completed JPEGs reuse one result file across submissions and tests. Recovery must also reuse a file created immediately before an interrupted index write. A request that would duplicate an image across source/result roles fails without saving another copy.

This identity check covers identical file bytes. Cropping, resizing, re-exporting, changing embedded metadata, or camera-picker conversion can change those bytes; detecting every visually similar version cannot be guaranteed by exact hashing. The program does not trust a browser-supplied fingerprint to substitute a different archived original. Copies manually created by dragging the same file into Drive are detected and receive only one eligible pool entry, but are not silently deleted. No broader Drive write permission is added for cleanup.

Finished exposures never join the source pool. A participant original joins `My_photos` only after explicit opt-in and a saved completed result, and it moves rather than being copied. The archive retains pending/nonconsenting originals privately in `participant_uploads`. The stable `participant_photo_N.ext` name identifies participant files for the artist, while private provenance and completed consent control eligibility. The number comes from the original source row, so gaps are normal; do not renumber the files or sort/delete index rows to change it. `INCLUDE_PARTICIPANT_PHOTOS=false` disables participant bases while retaining their files.

Retry saving keeps the same submission and assigned base in the open browser session. Keep that tab open until completion; closing it can leave a saved original without a finished result. The new **Sources** schema has nine columns, adding `modifiedAt`; **Submissions** has sixteen, adding `baseSha256`. Existing compatible indexes gain those fields, and earlier assigned bases are pinned before inventory changes. Do not manually edit source hashes, consent, submission tokens, or the Usage ledger.

The public image treatment remains **Saved Current, contrast 12, 0/0 EV**. `forceBlackAndWhite` in `project-config.js` sets the visitor checkbox’s initial value. Visitors choose colour and future-use consent before selecting a photo; those choices freeze at selection and stay fixed through automatic development, saving, retries, and further pairings. Archived originals retain their supplied colour and orientation. Local experimental sliders are separate from the public page.

Later backend edits require saving the Google files and deploying a new version through **Manage deployments → Edit → New version**. Keeping the deployment preserves its `/exec` address. Frontend publication is a separate manual step; none is currently authorized. The public repository is a selected copy, not a mirror of the working repository: GitHub edits do not sync locally, and local saves or commits do not publish. Compare remote and local changes before replacing public files. A local file edit does not update either service automatically.

To undo only the fast-scan revision, preserve current work, restore its affected files from local checkpoint **`89746ec`**, and select the existing Google deployment's **Version 4**. Local Git and the deployed Google version are separate; neither action changes the other environment or the current pause property. Older history also remains: the direct-folder **Version 1** is paired with local checkpoint **`23fad50`**, the import-page implementation with **`6e966b3`**, and **`before-limited-drive-access`** with **`f458bb2`**. Those are broader historical rollbacks. Restoring local files does not republish GitHub Pages or revoke an OAuth grant.

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
