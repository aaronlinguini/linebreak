# Google archive and artist base files

The double-exposure tool runs in the browser. The Google program supplies base photographs and saves participant originals, completed JPEGs, consent, and duplicate checks. It runs on Google's infrastructure; you do not rent a server or connect a Google account to an AI assistant.

## Current status — November 1, 2026

The dedicated account **aaron.double.exposure.project@gmail.com** holds the private photo archive and source index. Artist images are delivered from the website's selected static files; retained Drive originals still support index and duplicate verification. The [Apps Script project](https://script.google.com/home/projects/1gj7CIChAW6rMFOmP_Pb16TWSAwUKzZQxnOUOvvEUvDFOwQxKo65lYols/edit) uses these configured properties:

| Property | Value / status |
| --- | --- |
| `PROJECT_OWNER_EMAIL` | `aaron.double.exposure.project@gmail.com` |
| `SITE_URL` | `https://aaronlinguini.github.io/br/` — saved and verified after reloading |
| `UPLOADS_PAUSED` | `false` — explicitly approved and saved for live testing |
| `ALLOWED_ORIGINS` | `http://127.0.0.1:5500,http://localhost:5500` |

The earlier November 1 website and repository rename was to [apparitions](https://aaronlinguini.github.io/apparitions/) and [aaronlinguini/apparitions](https://github.com/aaronlinguini/apparitions). The existing Google project's `SITE_URL` was saved and verified after reloading; every other script property stayed unchanged. No backend deployment, account, permission, scope, folder ID or renderer changed. Earlier release records below retain their historical addresses.

The configured website is [aaronlinguini.github.io/br/](https://aaronlinguini.github.io/br/) and repository [aaronlinguini/br](https://github.com/aaronlinguini/br). The rename preserved repository ID `1442190888`, history, and `main`; local `origin` was verified. Google `SITE_URL` was saved and verified after reloading; it was the only changed value among the same eleven properties. Apps Script deployment, endpoint, account, permissions, scopes, folder IDs, local origins, artist assets, and renderer were unchanged. Verify the Pages run and live result after pushing website edits.

The tool opened at its new public path and completed Google connection after **Retry**. Its first handshake timed out; this check does not establish why, or verify a new upload/archive receipt.

**Google Version 8 deployed October 31 at 12:42 PM.** Updated `Code.gs` matched local bytes after reloading the editor; the generated catalog and bridge are unchanged. The [Google web app](https://script.google.com/macros/s/AKfycbyzIdwIui57NUjmTMm_XyNMvWNHZixo4UyMedoRtz7Qod4COqvjAbcwGDQounUvsCPv/exec) keeps the same `/exec` URL, dedicated account, **Anyone** access, OAuth scopes, properties, and archive IDs. The current local revision passes **414/414** checks. `UPLOADS_PAUSED=false` remains explicitly approved for testing. This does not authorize frontend publication.

The actual local asset build validated **113 unique artist files** in `assets/base-photos/` without changing names or bytes; a final read-only builder check reconfirmed them. It generated public `assets/base-photos.json` and private `google-apps-script/AssetCatalog.gs`. The **11:39:43 PM** owner refresh returned **artistCount: 113**, **complete: true**, zero skipped/deferred/issues, **websiteAssetCount: 113**, **websiteAssetCatalogCount: 113**, and **unmatchedWebsiteAssetCount: 0**. Browser QA loaded the actual **4,702,374-byte** `30thbirthday.JPG` over same-site HTTP with a SHA query through the verifying loader and real processor in both colour modes, with no load errors. Storage was simulated; this is not a new external upload or proof of a live saved exposure. A fresh Version 7 Chrome/Live Server production bootstrap succeeded after Retry with clear status/no error; its initial handshake timed out. Preserve local checkpoint **`29b2d1b`** and Google **Version 6** for rollback.

**Local Google connection verified:** real bridge and `exposureApi` requests from `http://127.0.0.1:5500` completed in Google's execution log. After Version 5 activation, a Chrome retry and a fresh in-app-browser page both completed bootstrap, cleared the connection status, and enabled the upload, camera, consent, and black-and-white controls. An earlier fresh Chrome attempt timed out; its cause was not established. The visitor bridge JavaScript is served by Google at `/exec?asset=bridge`, so this connection no longer needs GitHub Pages assets. The optional owner page still loads its CSS and JavaScript from `SITE_URL`. Around **9:09 PM on October 30**, the user reported successful manual double-exposure generation. That report is separate from independent checks of archive-folder contents, consent-based moves, duplicate reuse, another pairing, and phone/tablet behaviour; those checks remain pending. Earlier browser automation could not select a local photo because Chrome's automation extension lacked file-URL permission.

**Measured local preview:** one real Live Server run using a synthetic 2400 × 1600 upload showed the preview at **0.92 seconds**, Google connection at **5.89 seconds**, and a matching archive receipt at **18.84 seconds**. The earlier serial test showed a preview at 18.99 seconds and receipt at 27.44 seconds. Base photos were randomly selected and browser scheduling can vary, so these are individual test results. No physical-device performance claim is established. Checkpoint **`cfd8b73`** and Google **Version 7** preserve the prior flow.

**Current local interaction:** explicitly choose **Yes** or **No** for future use in the shared base-photo library, then set the colour choice before choosing or taking a photo. Neither future-use answer is selected by default; upload, camera capture, and generation remain unavailable until an answer is selected. Both answers still save the submitted original privately. Selection freezes both choices and starts development automatically, with no separate Create button or original-photo preview. A photo selected while Google is connecting develops immediately from a randomly selected website artist asset. When Google has already supplied its random mixed-pool candidate, that candidate is used instead; consented participant bases remain eligible and still download from Google. The local candidate has no Drive ID: Google resolves and validates its exact hash before confirming the pairing. The centered spinner uses the developing message written in the HTML. Once rendered, the image appears while the archive is still saving, with a smaller **Finishing…** indicator. Download and local colour changes are available immediately. Each generated mode is kept separately and its exact JPEG is archived after its parent confirms. Rotation and a new upload wait for all generated variants; a queued next pairing starts afterwards; no separate success message is shown. A failed save keeps the preview and **Retry saving**, without claiming that the result was archived. Keep the tab open until saving finishes. The pending-operation leave-page warning remains, but cannot ensure completion after closing the tab. An unavailable Google connection does not delay the local asset preview. **Retry saving** reconnects and resumes the same pending original/base/JPEG; reset remains locked until saving is confirmed. The tool keeps Home navigation and has no visible title heading.

**Google Version 6 is installed and deployed.** The backend adds authenticated same-base colour variants and batches the three existing Sources, Submissions, and Usage sheet reads into one request, preserving per-execution caching, missing-Usage compatibility, and durable write ordering. **Black and white** can also be changed after saving: it creates a new submission/result using the same original and pinned base, inherits consent, and uploads no new original. The earlier result remains archived. The preview timing changes only when the browser shows a rendered image; it is not evidence that Google storage itself became faster. Image calculation, scope grants, deployment URL, properties, and archive IDs remain unchanged. Local checkpoint **`736f769`** preserves the prior flow; **`8069a2c`** preserves the flow before automatic development. Browser checks with the real image processor and simulated delayed storage verified both colour directions, **Finishing…** with locked controls, and the enabled colour checkbox after a receipt. A fresh Version 6 Chrome/Live Server connection completed bootstrap after Retry; its first handshake timed out without an established cause. Live colour-variant/archive checks remain pending, and no new automated external photo upload, verified mobile-width check, or physical-device test has been performed.

**Current base collection:** the final owner refresh completed at **7:19:48 PM** with **113 eligible artist bases**, **complete: true**, **0 deferred**, **0 skipped**, and no issues. This includes the smaller replacement exports of accidentalselfie.jpeg and balcony.jpg. The bounded scans progressed through 19, 59, 90, and 112 indexed bases before completing all 113. No user image bytes, names, or folders were changed by the scan.

The approved frontend is live at [Ghost Images](https://aaronlinguini.github.io/ghost-images/) and [the double-exposure page](https://aaronlinguini.github.io/ghost-images/double-exposure.html), from public repository [ghost-images](https://github.com/aaronlinguini/ghost-images), commit `4e4ecec`. Pages deployment succeeded November 1. All 21 core files, eight emitted hashed URLs, and a sample photo passed exact-byte delivery checks (30/30). The live tool completed real Google bootstrap with no browser errors. No new upload/archive receipt or physical iPhone check is claimed. SITE_URL was saved and verified after editor reload; Google Version 8, endpoint, account, permissions and IDs were preserved. The old repository remains private and working history was not published. Further pushes need a new instruction.

Historical setup: the user approved the dedicated account's Google permissions, and `setupProject` created its folders and index on October 30 at **2:18:51 PM**. Version 1 deployed at **2:27 PM**; Version 3 added the consent-folder/duplicate handling revision at **3:25 PM**; Version 4 added the Google-served bridge; Version 5 added faster base-photo intake. The old **3:10:49–3:11:01 PM** scan's zero-base result concerned two earlier files only: accidentalselfie.jpeg had an unrecognized content signature and balcony.jpeg exceeded 30 MB. Those files were later replaced, so that result does not describe the current collection. The optional owner page previously showed correct folder links, and a real Incognito check denied owner access while signed out. Do not repeat initial authorization/setup, clear working IDs, or create another initial deployment.

Keep the existing originals in [My_photos](https://drive.google.com/drive/folders/1KTwgNyGgTgv8HwT1MrBaJeWk-JJIupKY), signed into **aaron.double.exposure.project@gmail.com**. The selected static artist library must match their indexed exact hashes; Drive is not a separate fallback artist pool. Current archive links:

| Project item | Link |
| --- | --- |
| Root folder | [Double_exposure_web_project (app)](https://drive.google.com/drive/folders/10BU2Di0YgAwW_fJ79Z0kDDq3_zBue1hY) |
| Artist bases and consented participant bases | [My_photos](https://drive.google.com/drive/folders/1KTwgNyGgTgv8HwT1MrBaJeWk-JJIupKY) |
| Private pending originals and completed No originals | [participant_uploads - TO BE DELETED](https://drive.google.com/drive/folders/1-ZpZKBP9NGF-ODqRxA6OdWBtabEmgwph) |
| Finished exposures | [Completed_double_exposures](https://drive.google.com/drive/folders/1pzaRs9SiFmCR8aXMeCLUhFkhXiItKisM) |
| Index | [Double exposure index](https://docs.google.com/spreadsheets/d/12jxnBQ1yels6UGYMQ_KB-uVuE8UULyMgx7ZX28XZ-JQ/edit) |

The [GitHub repository](https://github.com/aaronlinguini/double-exposure-online-project) is private and retains the last published frontend `949dc1`; the former Pages site is offline. Its project-account endpoint configuration is unchanged. The earlier personal-account deployment and its folders remain unchanged and paused as a rollback reference. Distinct new-account installation, folder-link, and deployment records are saved privately in the Git-ignored `secrets/` directory.

No personal Drive-folder sharing, repeated authorization, or new setup is needed. The optional owner import page is not required to manage the selected static artist assets.

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
- **participant_uploads - TO BE DELETED** is the renamed existing private `participant_uploads` folder; its ID, configured property, and link are unchanged. It holds every pending original, including pending **Yes** submissions, plus completed **No** originals. **Yes / No** controls future pairings, not private storage. The name does not delete files automatically. Owner cleanup must wait until **Finishing…** has cleared and the relevant uploads/saves are confirmed; never clear files while saving is pending. Before bulk deletion, arrange index-aware cleanup and retain the folder itself; deleting originals alone leaves source/submission references that can block repeated uploads or active re-pairing.
- **Completed_double_exposures** holds completed JPEGs. Identical results from separate submissions, retries, or tests reuse one file; the index can record several exposures referring to that same file. Finished exposures never enter the base-photo pool.

If a participant submits a byte-identical copy of an artist base already in `My_photos`, the existing artist file is reused and keeps its name and location. A folder scan preserves participant provenance and consent; a filename alone never grants consent.

## Add and manage artist base files

1. Copy selected JPEG, PNG, WebP, or AVIF files up to **30 MiB** each directly into local `assets/base-photos/`, preserving raw filenames. Do not include subfolders or unrelated files apart from `.DS_Store`.
2. Run `node scripts/build-base-assets.cjs`, then `node scripts/build-base-assets.cjs --check`. The builder validates signatures and hashes, deduplicates manifest entries, and writes `assets/base-photos.json` plus private `google-apps-script/AssetCatalog.gs`. It never copies, renames, resizes, re-encodes, or deletes the input photos. Empty/invalid input leaves previous outputs intact.
3. Retain the corresponding exact-byte Drive originals directly inside **My_photos** for the current metadata index and duplicate-original checks. New/changed assets must match indexed artist sources; a local file alone does not make an unmapped hash eligible.
4. Save generated **AssetCatalog.gs** in the existing Google project, and save **Code.gs** only when its code changed. Deploy a new version of the existing endpoint. Refresh the owner collection and confirm `websiteAssetCount` and `websiteAssetCatalogCount` agree with zero `unmatchedWebsiteAssetCount`. No new scopes, IDs, or OAuth approval are needed.

With the static catalog installed, Google returns a pinned artist descriptor rather than image base64. `base-assets.js` loads only the same website's encoded single-filename path, validates byte length and SHA-256, and caches the two most recent assets. Only matching mapped artists are eligible; an unavailable artist file fails without silently downloading a Drive fallback or selecting another artist collection. Consented participant bases continue through the dynamic Google pool. The exposure calculation and input bytes stay unchanged.

No import app or scheduled trigger is needed for normal use. With visitor uploads enabled, the program checks for folder changes when the site connects and before a new pairing. A completed scan is reused for up to one minute. Reload the site or use Retry after adding photographs. While visitor uploads are paused, run **refreshArtistCollection** in the project account's Apps Script editor to check the collection; the optional owner page can also check it.

Owner refresh diagnostics report at most **50** file issues using private metadata such as the filename, declared/detected type, size, and a bounded reason code. They do not include image bytes, access tokens, or file IDs, and are not returned to visitor requests. These diagnostics distinguish unsupported content and oversize files from successful intake.

The deployed faster scan uses Drive's output-only **SHA-256 checksum**, when available, plus a verified media-header read of at most **64 bytes** for new or changed JPEG, PNG, and WebP bases. Fresh metadata before and after the read must agree on checksum, size, type, modification time, version when supplied, parent folders, and download permission. Partial responses must have an exact `Content-Range` and the requested byte count. These checks do not alter the photograph. [Drive file metadata](https://developers.google.com/workspace/drive/api/reference/rest/v3/files), [partial media downloads](https://developers.google.com/workspace/drive/api/guides/manage-downloads).

The scan starts at most **150 header probes** and stops starting further artist reads after **25 seconds**, checking that deadline between files. This limits new requests rather than aborting work already in progress; it does not guarantee a 25-second request duration. Missing or invalid checksums and AVIF use full-file signature and SHA-256 validation, bounded by the existing **10 full reads / 64 MiB** allowance. AVIF stays on that path because its type information may extend beyond 64 bytes. If Drive ignores the range and returns HTTP 200, the program verifies and hashes that already downloaded full body once and counts its actual bytes against the full-read allowance; it does not fetch the file again. Failed full responses and buffered HTTP error bodies also consume that allowance. Unfinished scans resume on later requests, reusing verified unchanged records. A fresh supplied Drive checksum must still match the cached hash, even if size and modification time are unchanged.

Full Drive-byte verification remains for existing original reuse and dynamic participant bases. Static artist bytes are checked against the assigned SHA-256 in the browser instead. New-original intake still refuses to proceed until the source scan completes. Participant provenance, consent, folder moves, and duplicate handling are unchanged. Without site or owner requests, the program does not scan in the background.

**Fast scan is installed as Version 5.** Google Version 4 and local checkpoint `89746ec` preserve the prior scan for rollback. The current counts and remaining live checks are recorded above. This performance edit changes no image treatment, original retention, consent, duplicate handling, scopes, or archive IDs. Public service activation was separately approved; further pause changes remain the user's choice.

Byte-identical artist photos get only one eligible source-pool entry. Duplicate index records retain their metadata so later scans do not download them again. The program does not delete duplicate files that the user placed in Drive. Moving or deleting a base photo makes it ineligible after the next successful scan; already saved results remain archived. If a photo changes or disappears after it was assigned to a pending exposure, the pinned checksum prevents a retry from silently substituting different image content.

Base photos can be supplied to visitors for random pairings even though the Drive folders remain private. Photos displayed on future gallery pages are a separate selection; adding a base does not create a gallery page.

The optional `/exec?view=artist` page remains owner-only. Its upload control does not build the static website catalog; use the local artist-file steps above.

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

Preparation is local only. If publication is explicitly requested later, publish only the generated `.public-site/` contents. It contains twenty-one core files plus only the artist photos listed in the public manifest—currently 113:

- `index.html`, `double-exposure.html`, `experiment-1.html`, `experiment-2.html`, `experiment-3.html`
- `styles.css`, `scripts.js`, `project-config.js`
- `archive-workflow.js`, `drive-storage.js`, `drive-bridge.js`
- `artist-import.js`, `artist-import.css`
- `base-assets.js`, `assets/base-photos.json`
- `heic-input.js`, `vendor/heic-to/heic-to.js`, its `LICENSE`, `NOTICE.txt`, `SOURCES.tar.gz`, and the empty `.nojekyll` marker
- The exact `assets/base-photos/<filename>` entries in that manifest.

Do not publish the working repository, its history, `google-apps-script/` including **AssetCatalog.gs**, docs, tests, secrets, local comparisons, or unselected photos. The packager does not sweep in `images/` or experiment photographs; these need a separate explicit selection. The optional owner-page assets contain no credentials. Never publish every project file automatically.

Keep `SITE_URL` as the HTTPS repository base, including its path and trailing slash; the configured base is `https://aaronlinguini.github.io/br/`. The prepared tool page is `double-exposure.html`; `index.html` remains the physical homepage entry file, and its shared Home link uses `href="./"` for the clean repository root, not `/home`. The address change updated only the existing `SITE_URL` property, without an Apps Script redeployment. `SITE_URL` supplies the public website's permitted origin and the optional owner-page asset base. Local HTTP previews need their exact origins in `ALLOWED_ORIGINS`; `file://` cannot connect to the archive.

The visitor bridge HTML now points to the same Google deployment's fixed `?asset=bridge` route. That route serves only the generated JavaScript with a JavaScript MIME type; it reads no script properties or Google files and accepts no filename or caller-supplied code. The normal bridge page still checks the website origin, and the JavaScript still checks its top window, channel, message origin, and permitted operations. The route uses [Google's Content Service](https://developers.google.com/apps-script/guides/content), which redirects the static response to a Google content URL. HTML continues to contain only an external script reference.

The bridge repair is installed in the existing Google project. Its generated **Client.gs** is separate from the new private artist **AssetCatalog.gs**. Bridge changes require rebuilding Client.gs; artist file changes require rebuilding the asset catalog. Save affected Google sources and update the existing deployment while preserving its `/exec` URL, account, Anyone access, permissions, properties, and folder IDs. Do not rerun setup or grant new scopes.

While GitHub Pages is offline, the optional owner page's external assets remain unavailable. Direct Drive uploads, collection checks in the Apps Script editor, and `local-test.html` remain available. The visitor bridge is verified from an explicitly allowed local HTTP origin while the public website remains offline. **`UPLOADS_PAUSED=true` blocks visitor bootstrap, uploads, and completion**; the current value is **false**, explicitly approved for live testing. Publishing frontend files or changing the service's pause state requires the user's instruction.

## Remaining live workflow checks

The existing Google service is active as explicitly approved, and the frontend remains local. The user has reported successful manual generation; the checks below still need independent archive confirmation. The automated tests, connected bridge, and successful displayed result do not replace the consent, duplicate, and folder checks. Use the local HTTP website. At least two distinct usable bases are required to test another pairing. Do not repeat setup or change the pause setting to begin testing.

1. The Version 7 owner refresh verified all **113** selected assets against the source index with zero unmatched entries, and fresh production bootstrap completed after Retry. A real website asset passed direct HTTP loading/hash checks in both colour modes with simulated storage. Verify the live end-to-end archive separately, then check a later catalog change, missing/mismatched asset failure without Drive fallback, and duplicate-file handling using the artist-file steps above.
2. Open `double-exposure.html` from the home page in a genuinely signed-out/private browser. Before choosing a photo, confirm that neither future-use answer is selected and upload/camera controls are unavailable. Select **No** and set the colour choice. Select a different photo; it develops automatically. The rendered preview appears while **Finishing…** is shown. While the save is pending, download the displayed JPEG and switch between Black and white and Original colour. Confirm that an older receipt never replaces the selected mode, each generated JPEG is archived once with the same base/original/consent, and a queued next pairing waits for every variant. Rotation and a new upload unlock after those receipts without a success message.
3. Verify its exact original in **participant_uploads - TO BE DELETED**, its JPEG in **Completed_double_exposures**, and a completed row with `allowReuse=false`. The participant source must remain ineligible for future pairings.
4. Start over, explicitly select **Yes** before selecting another photo, and let it develop automatically. After its result is saved, confirm that the original **moves** from `participant_uploads - TO BE DELETED` into `My_photos`, gets a stable **participant_photo_N.ext** name, and joins future pairings. Confirm that its original file ID is unchanged and no second image copy exists. Random selection does not guarantee it is selected immediately.
5. Reuse the same original, upload a renamed identical file, and test **Pair this image with a different photo**. Confirm one original across both source folders, stable numbering, and avoidance of the immediately previous base. Repeat with an artist photo already in `My_photos`; no participant copy or artist rename should result. Repeat an identical finished JPEG across separate test submissions; both records must refer to one completed file.
6. Retry an interrupted save. Confirm that an unconfirmed preview remains with Retry saving and stable submission/base/result identity, without allowing a download or falsely reporting success. A changed or removed assigned artist photo must fail clearly rather than silently replace the base.
7. Change **Black and white** on a saved result in both directions. Confirm a new submission ID with the same original, pinned base, and consent, no additional original copy, and an archived JPEG matching the displayed colour mode. The earlier result must remain unchanged. An identical JPEG should reuse its existing archived file. Retry a failed variant without selecting a new base or changing its JPEG/recipe.
8. Verify `/exec?view=artist` denies signed-out and different-account visitors while the project owner can use it. Do not treat another signed-in browser as an anonymous test.
9. Test library selection, camera capture, cancellation, and portrait input on actual phones/tablets. Desktop layout tests do not prove camera-picker or HEIC-conversion behavior.

Do not describe the real archive workflow as tested until these checks pass. If the user wants to close the active service, set `UPLOADS_PAUSED=true` at their request; do not silently change it because a check remains unfinished.

## Archive behavior and later updates

Participant originals keep the exact bytes supplied by their device's picker. The consent-folder revision computes SHA-256 on the server before saving. Identical original files reuse a verified existing artist or participant source; changing a filename does not make a new photo. Identical completed JPEGs reuse one result file across submissions and tests. Recovery must also reuse a file created immediately before an interrupted index write. A request that would duplicate an image across source/result roles fails without saving another copy.

This identity check covers identical file bytes. Cropping, resizing, re-exporting, changing embedded metadata, or camera-picker conversion can change those bytes; detecting every visually similar version cannot be guaranteed by exact hashing. The program does not trust a browser-supplied fingerprint to substitute a different archived original. Copies manually created by dragging the same file into Drive are detected and receive only one eligible pool entry, but are not silently deleted. No broader Drive write permission is added for cleanup.

Finished exposures never join the source pool. A participant original joins `My_photos` only after explicit opt-in and a saved completed result, and it moves rather than being copied. The archive retains all pending originals, including **Yes** submissions, and completed **No** originals privately in `participant_uploads - TO BE DELETED`. Both choices still save the original; **No** does not opt out of private storage. Owner cleanup is manual and must wait until **Finishing…** clears and the relevant saves are confirmed. The stable `participant_photo_N.ext` name identifies participant files for the artist, while private provenance and completed consent control eligibility. The number comes from the original source row, so gaps are normal; do not renumber the files or sort/delete index rows to change it. `INCLUDE_PARTICIPANT_PHOTOS=false` disables participant bases while retaining their files.

Retry saving keeps the same submission, assigned base, rendered JPEG, and settings in the open browser session. The preview can appear before Google confirms its archive; it is not proof that saving finished. Keep the tab open until **Finishing…** clears and the controls unlock. Closing it can interrupt the save and leave a saved original without a finished result, even if the browser showed a preview or a leave-page warning. The **Sources** schema has nine columns, adding `modifiedAt`; **Submissions** has sixteen, adding `baseSha256`. Existing compatible indexes gain those fields, and earlier assigned bases are pinned before inventory changes. Do not manually edit source hashes, consent, submission tokens, or the Usage ledger.

The public image treatment remains **Saved Current, contrast 12, 0/0 EV**. `forceBlackAndWhite` in `project-config.js` sets the visitor checkbox’s initial value. Visitors explicitly choose **Yes** or **No** for future shared-base use, with neither selected by default, and choose colour before selecting a photo; each operation freezes those choices for automatic development, saving, and retries. Both colour radios stay available during saving; only local rendering, rotation, or a new pair before its preview disables them. A saved-result colour change uses a new submission ID with authenticated `reuse.sameBase=true`, the same pinned base and original, and inherited consent. It creates a new archived variant without replacing the old recipe or uploading another original. An already-rendered mode reuses its cached result; another random pairing inherits the visible selected mode and requests a different base. Archived originals retain their supplied colour and orientation. Local experimental sliders are separate from the public page.

Later backend edits require saving the Google files and deploying a new version through **Manage deployments → Edit → New version**. Keeping the deployment preserves its `/exec` address. Frontend publication is separate; the approved November 1 snapshot is live, and later pushes require a new instruction. The public repository is a selected copy, not a mirror of the working repository: GitHub edits do not sync locally, and local saves or commits do not publish. Compare remote and local changes before replacing public files. A local file edit does not update either service automatically.

To undo only the fast-scan revision, preserve current work, restore its affected files from local checkpoint **`89746ec`**, and select the existing Google deployment's **Version 4**. Local Git and the deployed Google version are separate; neither action changes the other environment or the current pause property. Older history also remains: the direct-folder **Version 1** is paired with local checkpoint **`23fad50`**, the import-page implementation with **`6e966b3`**, and **`before-limited-drive-access`** with **`f458bb2`**. Those are broader historical rollbacks. Restoring local files does not republish GitHub Pages or revoke an OAuth grant.

For the static-artist migration specifically, checkpoint **`29b2d1b`** and Google **Version 6** preserve the previous delivery path. Preserve later work before restoring recorded local files; select the Google version separately. Keep all original Drive files and working IDs.

## Intake and storage limits

Optional Script Properties control visitor intake:

| Property | Default | Effect |
| --- | --- | --- |
| `REQUESTS_PER_MINUTE` | `120` | Global visitor API attempts per fixed UTC minute, including retries and connection checks |
| `SUBMISSIONS_PER_DAY` | `200` | New visitor submissions per UTC day, including another pairing or saved colour variant; retries reuse their submission |
| `UPLOAD_BYTES_PER_DAY` | `1073741824` | Newly saved visitor original/result bytes per UTC day; duplicates and recovered files are not charged again |
| `UPLOADS_PAUSED` | `false` | Set true to close visitor requests while keeping owner setup/checks available |

The daily byte allowance is adjustable; it is not a 1 GB total archive limit or a change to the Google storage plan. Counters reset at midnight UTC. A limit can pause completion after an original is saved; its retry can finish after the allowance resets or is raised. Limits contain global usage, not per-person fairness or every possible form of abuse. The private Usage ledger reserves writes before saving files, and unused older reservations must fit the current day's allowance. Abandoned attempts can conservatively consume allowance; malformed limits or accounting close visitor uploads until corrected.

The project account's storage and Google service quotas still apply. Public results use up to 2,400 pixels on the longest edge and JPEG uploads up to 12 MB. Large collections and sustained traffic need a real load check. Google Sheets also has per-user API quotas, so bounded image reads alone do not establish a supported collection or visitor capacity.

Google references: [web apps](https://developers.google.com/apps-script/guides/web), [authorization](https://developers.google.com/apps-script/guides/services/authorization), [HTML-service RPC](https://developers.google.com/apps-script/guides/html/communication), [external assets](https://developers.google.com/apps-script/guides/html/restrictions), [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas), [Sheets quotas](https://developers.google.com/workspace/sheets/api/limits).
