# Google archive and artist base files

The double-exposure tool runs in the browser. The Google program supplies base photographs and saves completed JPEGs, consent, duplicate-check metadata, and only the originals whose retention was permitted. It runs on Google's infrastructure; you do not rent a server or connect a Google account to an AI assistant.

## Current status — November 3, 2026

Google **Version 13** was deployed November 3, 2026, at **11:29 AM Toronto time** on the existing endpoint in **aaron.double.exposure.project@gmail.com**. Anyone access, scopes, properties, and existing archive IDs are unchanged; **Version 12** remains available for rollback. All **592/592 automated checks** and both generated-template builder checks pass. Frontend publication and installation of the regenerated Studio.html remain pending. No new account setup or permission grant was needed.

Version 13 saved/reloaded Code.gs matched **64,527 bytes**, SHA-256 `2c1fec8bafb8fc6feb018b2abecd29e507a67a1553505c910fdc6f39182cae79`. Real Google bootstrap checks returned: mixed **128 = 113 artist + 15 participant**; artist-only **113 artist + 0 participant**; all 113 website SHA-256 values excluded **0 artist + 15 participant**, with no excluded candidate returned. These checks uploaded no originals and did not verify a new archived result. Local responsive browser QA at 390px had clientWidth/scrollWidth 390/390; no physical-device claim follows.

The custom-domain cutover to [line-break.ca](https://line-break.ca/) was verified November 2. GitHub account-domain ownership and the repository custom domain were verified, with a successful DNS check. The four GitHub A records, `www` CNAME, and ownership TXT were verified across all four authoritative nameservers; CIRA delegation appeared at **7:15 PM Toronto time**. Preserve the ownership TXT, DomainConnect, and email-security records. Valid HTTPS returned 200 at the apex; `www` returned 301 to the HTTPS apex, then 200. **Enforce HTTPS** remained checked after reloading GitHub settings. Eight delivered files—the home, tool, manifest, and five studio dependencies—matched prepared bytes.

Google's `SITE_URL` and `ALLOWED_ORIGINS` below were saved and verified after reloading; all other property names, order, and values were preserved. The account, endpoint, Version 12 deployment, Anyone access, scopes, and folder IDs are unchanged, without a Google redeployment. The anonymous tool's initial Please wait cleared to its normal UI without errors; a fresh owner studio loaded all hashed scripts/styles from the new domain without errors. No photo uploads or saves were tested for this cutover.

Both application-level daily caps remain removed. Their initial Google Version 10 release deployed November 2 at 2:33 PM on the same endpoint with the same project account, Anyone access, scopes, properties, and folder IDs. Saved Code.gs matched local bytes after editor reload (62,548 bytes; SHA-256 6d8cd19ac48ad9d7653f89f90048f1be0000b9cbbd80cef38c6c7e706d993f4c). That release passed 481/481 checks and performed no new live photo submission; Version 9 was retained for rollback.

The earlier consent-retention revision was installed as **Google Version 9**: Yes retains the original in `participant_uploads`; No archives only the finished result, with no original file or Sources row. Google Version 9 was deployed November 2 at 1:36 PM in the dedicated project account on the existing endpoint, with Anyone access and unchanged scopes, properties, and folder IDs. Saved Code.gs matched local bytes after editor reload (SHA-256 42067f2d67a72284e887bcd32df48727ab3c7f00a1c2602fa7932cab1791a5c9); Version 8 remains available for rollback. The same originals folder was renamed participant_uploads and its name was verified after reload. All 479 automated checks pass. No new live photo submission or physical-device check was performed in this revision.

The dedicated account **aaron.double.exposure.project@gmail.com** holds the private photo archive and source index. Artist images are delivered from the website's selected static files; retained Drive originals still support index and duplicate verification. The [Apps Script project](https://script.google.com/home/projects/1gj7CIChAW6rMFOmP_Pb16TWSAwUKzZQxnOUOvvEUvDFOwQxKo65lYols/edit) uses these configured properties:

| Property | Value / status |
| --- | --- |
| `PROJECT_OWNER_EMAIL` | `aaron.double.exposure.project@gmail.com` |
| `SITE_URL` | `https://line-break.ca/` — saved and verified after reloading |
| `UPLOADS_PAUSED` | `false` — explicitly approved and saved for live testing |
| `ALLOWED_ORIGINS` | `http://127.0.0.1:5500,http://localhost:5500,https://aaronlinguini.github.io,https://line-break.ca,https://www.line-break.ca` |

The earlier November 1 website and repository rename was to [apparitions](https://aaronlinguini.github.io/apparitions/) and [aaronlinguini/apparitions](https://github.com/aaronlinguini/apparitions). The existing Google project's `SITE_URL` was saved and verified after reloading; every other script property stayed unchanged. No backend deployment, account, permission, scope, folder ID or renderer changed. Earlier release records below retain their historical addresses.

The preceding rename configured [aaronlinguini.github.io/br/](https://aaronlinguini.github.io/br/) and repository [aaronlinguini/br](https://github.com/aaronlinguini/br), preserving repository ID `1442190888`, history, and `main`. Local `origin` and Google's `SITE_URL` were verified; only that property changed among the same eleven properties.

The November 1 rename configured [aaronlinguini.github.io/linebreak/](https://aaronlinguini.github.io/linebreak/) and repository [aaronlinguini/linebreak](https://github.com/aaronlinguini/linebreak). The rename and local `origin` were verified, preserving repository ID `1442190888`, history, and `main`. At that stage, Google `SITE_URL` was saved and verified after reloading in the project account; it was the only changed value among the same eleven properties. Apps Script deployment, endpoint, account, permissions, scopes, folder IDs, local origins, artist assets, and renderer were unchanged. Verify the Pages run and live result after pushing website edits.

The tool opened at its new public path and completed Google connection after **Retry**. Its first handshake timed out; this check does not establish why, or verify a new upload/archive receipt.

**Google Version 8 deployed October 31 at 12:42 PM.** Updated `Code.gs` matched local bytes after reloading the editor; the generated catalog and bridge are unchanged. The [Google web app](https://script.google.com/macros/s/AKfycbyzIdwIui57NUjmTMm_XyNMvWNHZixo4UyMedoRtz7Qod4COqvjAbcwGDQounUvsCPv/exec) keeps the same `/exec` URL, dedicated account, **Anyone** access, OAuth scopes, properties, and archive IDs. The current local revision passes **414/414** checks. `UPLOADS_PAUSED=false` remains explicitly approved for testing. This does not authorize frontend publication.

The actual local asset build validated **113 unique artist files** in `assets/base-photos/` without changing names or bytes; a final read-only builder check reconfirmed them. It generated public `assets/base-photos.json` and private `google-apps-script/AssetCatalog.gs`. The **11:39:43 PM** owner refresh returned **artistCount: 113**, **complete: true**, zero skipped/deferred/issues, **websiteAssetCount: 113**, **websiteAssetCatalogCount: 113**, and **unmatchedWebsiteAssetCount: 0**. Browser QA loaded the actual **4,702,374-byte** `30thbirthday.JPG` over same-site HTTP with a SHA query through the verifying loader and real processor in both colour modes, with no load errors. Storage was simulated; this is not a new external upload or proof of a live saved exposure. A fresh Version 7 Chrome/Live Server production bootstrap succeeded after Retry with clear status/no error; its initial handshake timed out. Preserve local checkpoint **`29b2d1b`** and Google **Version 6** for rollback.

**Local Google connection verified:** real bridge and `exposureApi` requests from `http://127.0.0.1:5500` completed in Google's execution log. After Version 5 activation, a Chrome retry and a fresh in-app-browser page both completed bootstrap, cleared the connection status, and enabled the upload, camera, consent, and black-and-white controls. An earlier fresh Chrome attempt timed out; its cause was not established. The visitor bridge JavaScript is served by Google at `/exec?asset=bridge`, so this connection no longer needs GitHub Pages assets. The optional owner page still loads its CSS and JavaScript from `SITE_URL`. Around **9:09 PM on October 30**, the user reported successful manual double-exposure generation. That report is separate from independent checks of archive-folder contents, consent-based moves, duplicate reuse, another pairing, and phone/tablet behaviour; those checks remain pending. Earlier browser automation could not select a local photo because Chrome's automation extension lacked file-URL permission.

**Measured local preview:** one real Live Server run using a synthetic 2400 × 1600 upload showed the preview at **0.92 seconds**, Google connection at **5.89 seconds**, and a matching archive receipt at **18.84 seconds**. The earlier serial test showed a preview at 18.99 seconds and receipt at 27.44 seconds. Base photos were randomly selected and browser scheduling can vary, so these are individual test results. No physical-device performance claim is established. Checkpoint **`cfd8b73`** and Google **Version 7** preserve the prior flow.

**Current local interaction:** choose Yes or No before selecting or taking a photo; neither answer is selected by default. Yes retains the fresh original in the existing private participant folder and can make it a future base only after a completed result. No transiently validates the input but creates no Drive original and no Sources row. Selection freezes that answer and the colour choice and starts development automatically. The preview may appear while saving, but all result actions and colour choices stay disabled until matching receipts confirm completion. Transient failures retry automatically with the same identity; permanent errors retain manual retry. Keep the tab open until completion. The pending-operation warning cannot ensure completion after closing or reloading. Google Version 13 is deployed and its saved source was verified; no new visitor-submission or physical-device test was performed in this revision.

**Google Version 6 is installed and deployed.** The backend adds authenticated same-base colour variants and batches the three existing Sources, Submissions, and Usage sheet reads into one request, preserving per-execution caching, missing-Usage compatibility, and durable write ordering. **Black and white** can also be changed after saving: it creates a new submission/result using the same original and pinned base, inherits consent, and uploads no new original. The earlier result remains archived. The preview timing changes only when the browser shows a rendered image; it is not evidence that Google storage itself became faster. Image calculation, scope grants, deployment URL, properties, and archive IDs remain unchanged. Local checkpoint **`736f769`** preserves the prior flow; **`8069a2c`** preserves the flow before automatic development. Browser checks with the real image processor and simulated delayed storage verified both colour directions, **Finishing…** with locked controls, and the enabled colour checkbox after a receipt. A fresh Version 6 Chrome/Live Server connection completed bootstrap after Retry; its first handshake timed out without an established cause. Live colour-variant/archive checks remain pending, and no new automated external photo upload, verified mobile-width check, or physical-device test has been performed.

**Current base collection:** the final owner refresh completed at **7:19:48 PM** with **113 eligible artist bases**, **complete: true**, **0 deferred**, **0 skipped**, and no issues. This includes the smaller replacement exports of accidentalselfie.jpeg and balcony.jpg. The bounded scans progressed through 19, 59, 90, and 112 indexed bases before completing all 113. No user image bytes, names, or folders were changed by the scan.

The approved frontend is live at [Ghost Images](https://aaronlinguini.github.io/ghost-images/) and [the double-exposure page](https://aaronlinguini.github.io/ghost-images/double-exposure.html), from public repository [ghost-images](https://github.com/aaronlinguini/ghost-images), commit `4e4ecec`. Pages deployment succeeded November 1. All 21 core files, eight emitted hashed URLs, and a sample photo passed exact-byte delivery checks (30/30). The live tool completed real Google bootstrap with no browser errors. No new upload/archive receipt or physical iPhone check is claimed. SITE_URL was saved and verified after editor reload; Google Version 8, endpoint, account, permissions and IDs were preserved. The old repository remains private and working history was not published. Further pushes need a new instruction.

Historical setup: the user approved the dedicated account's Google permissions, and `setupProject` created its folders and index on October 30 at **2:18:51 PM**. Version 1 deployed at **2:27 PM**; Version 3 added the consent-folder/duplicate handling revision at **3:25 PM**; Version 4 added the Google-served bridge; Version 5 added faster base-photo intake. The old **3:10:49–3:11:01 PM** scan's zero-base result concerned two earlier files only: accidentalselfie.jpeg had an unrecognized content signature and balcony.jpeg exceeded 30 MB. Those files were later replaced, so that result does not describe the current collection. The optional owner page previously showed correct folder links, and a real Incognito check denied owner access while signed out. Do not repeat initial authorization/setup, clear working IDs, or create another initial deployment.

Keep the existing originals in [My_photos](https://drive.google.com/drive/folders/1KTwgNyGgTgv8HwT1MrBaJeWk-JJIupKY), signed into **aaron.double.exposure.project@gmail.com**. The selected static artist library must match their indexed exact hashes; Drive is not a separate fallback artist pool. Current archive links:

| Project item | Link |
| --- | --- |
| Root folder | [Double_exposure_web_project (app)](https://drive.google.com/drive/folders/10BU2Di0YgAwW_fJ79Z0kDDq3_zBue1hY) |
| Artist originals and earlier retained participant originals | [My_photos](https://drive.google.com/drive/folders/1KTwgNyGgTgv8HwT1MrBaJeWk-JJIupKY) |
| Newly retained Yes originals and legacy retained originals | [participant_uploads](https://drive.google.com/drive/folders/1-ZpZKBP9NGF-ODqRxA6OdWBtabEmgwph) |
| Finished exposures | [Completed_double_exposures](https://drive.google.com/drive/folders/1pzaRs9SiFmCR8aXMeCLUhFkhXiItKisM) |
| Index | [Double exposure index](https://docs.google.com/spreadsheets/d/12jxnBQ1yels6UGYMQ_KB-uVuE8UULyMgx7ZX28XZ-JQ/edit) |

The [GitHub repository](https://github.com/aaronlinguini/double-exposure-online-project) is private and retains the last published frontend `949dc1`; the former Pages site is offline. Its project-account endpoint configuration is unchanged. The earlier personal-account deployment and its folders remain unchanged and paused as a rollback reference. Distinct new-account installation, folder-link, and deployment records are saved privately in the Git-ignored `secrets/` directory.

No personal Drive-folder sharing, repeated authorization, or new setup is needed. The optional owner import page is not required to manage the selected static artist assets.

## Private personal studio

The live owner address is [the existing web app with `?view=studio`](https://script.google.com/macros/s/AKfycbyzIdwIui57NUjmTMm_XyNMvWNHZixo4UyMedoRtz7Qod4COqvjAbcwGDQounUvsCPv/exec?view=studio). Use **aaron.double.exposure.project@gmail.com**. Both the `doGet` page and each `studioApi` status/save request require the active account to match the effective executing account and `PROJECT_OWNER_EMAIL`. The existing deployment remains accessible to Anyone for visitor use; the studio's separate owner checks apply before its HTML, folder, or save operations are accessed. There is no public navigation link.

The generated `Studio.html` reuses `local-test.html` and its comparison controls. Ordinary `local-test.html` stays local-only and sends no images to Google. Only the private studio loads the autosave adapter. It saves completed reference and trial JPEGs after an 800 ms settling interval, with one latest queued version per output type and immutable in-flight/retry bytes. Source photographs are never uploaded separately; device downloads remain unchanged. A matching SHA-256, byte length, dimensions, file URL, and folder receipt are required before reporting a save. Transient failures retry automatically; other errors retain manual retry and unsaved work keeps the leave-page warning.

The first authenticated studio status/save request obtains or creates the app-managed **Personal_double_exposures** folder under the existing project root. Its ID uses the new `EXPOSURE_OWNER_RESULTS_FOLDER_ID` property, separate from all existing artist, participant, and finished-visitor-result folder IDs. These personal JPEGs never join the visitor base pool and do not write Sources, Submissions, or Usage rows. Exact-byte duplicate results reuse verified files. No new scopes, account setup, sharing, or changes to existing archive IDs are required.

Version 11 installation was verified by saving and reloading each Google editor file and comparing its full bytes:

| Google file | Bytes | SHA-256 |
| --- | ---: | --- |
| Code.gs | 62,748 | `f15dd0a6cb72e93c03b46ad52870d341fe888d9a08ff4ee9ba37d36361865639` |
| OwnerStudio.gs | 3,605 | `3fe69c4f007190cc833a3b25623d84fd3d9056e1078f21ce45b0bc6285717204` |
| Studio.html | 10,333 | `9886837518139bcf27b7d947e01fe9f5126d31fdbefb21686544e528c1d6af2f` |

[Commit 89bf43e](https://github.com/aaronlinguini/linebreak/commit/89bf43e8c0179964bd8712e711233dde97e0c338) passed [Pages run 41542819967](https://github.com/aaronlinguini/linebreak/actions/runs/41542819967). Six delivered support files, including scripts.js, matched the prepared bytes; `local-test.html` returned 404 publicly. The studio loaded in the project account, and an anonymous in-app browser was denied with the project-account message. Its status call created **Personal_double_exposures**, whose Drive details showed **Private to you**. Two synthetic source PNGs produced saved reference/trial JPEGs; adjusting contrast from 12 to 13 produced a third JPEG and a confirmed saved message. No source originals were stored. Existing downloads are unchanged; no physical-phone QA is claimed.

Cleanup selected exactly those three synthetic JPEGs by their full hash filenames and moved them to recoverable Drive Trash. The folder was verified empty and still **Private to you**. The studio was reloaded without selected photographs so it would not recreate the test outputs. No real photographs were touched and nothing was permanently deleted.

The Version 12 follow-up deployed November 2 at **6:30 PM Toronto time** adds only `HtmlOutput.addMetaTag('viewport', 'width=device-width, initial-scale=1')` in OwnerStudio.gs because Google ignores the HTML-file meta tag. Saved and reloaded OwnerStudio.gs matched **3,677 bytes**, SHA-256 `3e8f881f19279e89c225b3fadc01ad5ea9772e3ff6836c005e5b6e7a46b59dd4`. The actual live outer document's viewport meta content was verified as `width=device-width, initial-scale=1`. All **17 backend studio tests** pass; the full suite remains at 527 tests, with no additional test count. Code.gs, Studio.html, and public asset bytes are unchanged. The endpoint, project account, Anyone access, scopes, and IDs are preserved; Version 11 remains the preceding rollback. Responsive Chrome QA at 390 × 844 verified outer width 390 and inner document clientWidth/scrollWidth both 390, without horizontal overflow. The temporary viewport was reset and the owner page was left ready with no selected photographs. This browser check does not establish physical-phone behavior.

To install or update this addition:

1. Run `node scripts/build-owner-studio.cjs` and `node scripts/build-owner-studio.cjs --check`. The generated `google-apps-script/Studio.html` uses final content-hashed public asset URLs, with the configured `SITE_URL` substituted by Google.
2. Publish the matching static dependencies through the normal Pages workflow: `local-test.js`, `local-test.css`, `film-renderer.js`, `tone-adjustments.js`, and `owner-studio.js`. They contain no credentials. Neither `local-test.html`, generated Studio.html, nor backend sources are Pages assets.
3. Save affected **Code.gs**, **OwnerStudio.gs**, and generated **Studio.html** in the existing Google project. Regenerate and reinstall Studio.html whenever the comparison page or dependency bytes change.
4. Update the existing deployment through **Manage deployments → Edit → New version**, preserving its `/exec` URL, project account, Anyone access, scopes, and existing properties/IDs. Do not rerun setup or create another initial deployment. Record the actual version and saved-source verification after installation.
5. Verify owner access, denial when signed out or signed into a different account, an exact-byte personal save receipt, reference reuse, and a later trial adjustment. Confirm that source photos, visitor archives/index, and existing download controls remain untouched. Automated tests do not establish this live evidence.

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

- **My_photos** keeps artist originals unchanged. Earlier retained participant files can remain here until a new authorized Yes completion moves that participant original to participant_uploads, preserving its file ID and bytes without a copy. Do not move newly retained Yes originals here, bulk-migrate existing files, or delete archives.
- **participant_uploads** keeps the same private folder ID, configured property, and link. The new revision retains Yes originals here, including while pending; eligible participant use begins only after a completed result. Fresh No originals are never written here or to Sources. Older retained files are not bulk-migrated or deleted; a participant original can move here on a new authorized Yes completion. This folder holds live consented bases and must not be cleared wholesale. Owner cleanup must avoid pending saves and update dependent indexes; the name never triggers automatic deletion.
- **Completed_double_exposures** holds completed JPEGs. Identical results from separate submissions, retries, or tests reuse one file; the index can record several exposures referring to that same file. Finished exposures never enter the base-photo pool.

For a retained Yes submission that is a byte-identical copy of an artist base already in `My_photos`, the existing artist file is reused and keeps its name and location. A folder scan preserves participant provenance and consent; a filename alone never grants consent.

## Pairing history and pool filtering

The Version 13 backend keeps connected mixed-pool selection uniform over eligible unique SHA-256 values, without giving Drive participant photographs additional weight. The optional **Only pair my photo with Aaron's original base library** checkbox starts unchecked and restricts new choices to eligible mapped artist assets. It is independent of Yes/No original retention; the selected pool and history snapshot are frozen per operation, inherited by re-pairing and saved colour variants, and preserved for retries. Same-base colour changes keep the existing pinned pair.

The browser stores contribution fingerprints under `line-break.contributions.v1` in same-origin local storage, including the current selected file before pairing. Only hashes are persisted there. Old contributions not recorded by this browser, different browsers/devices/origins, private sessions, clearing site data, and blocked storage limit recognition. File-byte changes may also change the hash. There is no cross-device account history or server inference of earlier ownership.

`excludedBaseHashes` and `artistOnly` filter bootstrap, new begin requests, and alternative-base availability; begin/complete carry the operation's immutable values. Empty history and the default mixed mode omit their optional request fields for compatibility. Validation accepts at most 20,000 lowercase SHA-256 entries before deduplication. This is a protocol array bound, not a daily submission or archive-byte quota. Existing intake limits and per-file validation are otherwise unchanged.

Artist files retain static website delivery and participant files retain dynamic Drive delivery. The fast local artist fallback remains available while Google connects. A valid manifest with no eligible local base reports `NO_LOCAL_BASE`, allowing the existing selected file to continue without a local preview while the server chooses from the requested pool. Invalid manifests and image-integrity failures remain fatal. Changing the pool invalidates its cached bootstrap candidate and serializes a fresh connection; stale responses cannot substitute a different displayed pair.

Code.gs is installed as Version 13 on the existing endpoint, preserving the project account, Anyone access, scopes, properties, and folder IDs. Frontend publication must still be verified, followed by installing the regenerated Studio.html with matching public asset hashes and updating this same deployment. Automated validation is **592/592**; a bootstrap check does not establish a new upload or archived result.

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

Current publication uses normal commits/pushes and GitHub Actions to deploy only the generated `.public-site/` contents. Ordinary root HTML pages except `local-test.html`, their selected gallery photos, shared assets, the studio's five static dependencies, and the selected artist manifest are included. The following twenty-one-path list describes the earlier selected-copy package, retained for reference:

- `index.html`, `double-exposure.html`, `experiment-1.html`, `experiment-2.html`, `experiment-3.html`
- `styles.css`, `scripts.js`, `project-config.js`
- `archive-workflow.js`, `drive-storage.js`, `drive-bridge.js`
- `artist-import.js`, `artist-import.css`
- `base-assets.js`, `assets/base-photos.json`
- `heic-input.js`, `vendor/heic-to/heic-to.js`, its `LICENSE`, `NOTICE.txt`, `SOURCES.tar.gz`, and the empty `.nojekyll` marker
- The exact `assets/base-photos/<filename>` entries in that manifest.

The Pages artifact excludes `google-apps-script/` including **AssetCatalog.gs** and **Studio.html**, docs, tests, secrets, `local-test.html`, and unselected photos. Active gallery HTML references select experiment photographs. Shared comparison/studio JavaScript and CSS are static dependencies, not a public studio page, and contain no credentials. The normal repository and history are public under the current workflow; secrets and incoming participant files remain ignored. Never add every working file to the website artifact.

Keep `SITE_URL` as the canonical HTTPS website base with a trailing slash; the configured base is `https://line-break.ca/`. The prepared tool page is `double-exposure.html`; `index.html` remains the physical homepage entry file, and its shared Home link uses `href="./"` for the clean website root, not `/home`. The custom-domain cutover updated `SITE_URL` and the explicit `ALLOWED_ORIGINS` union without an Apps Script redeployment. `SITE_URL` supplies the public website's permitted origin and the optional owner-page asset base. Allowed-origin values are origins without a path or trailing slash; preserve both local port-5500 origins, the old GitHub origin, and the apex/`www` HTTPS origins listed above. `file://` cannot connect to the archive.

The visitor bridge HTML now points to the same Google deployment's fixed `?asset=bridge` route. That route serves only the generated JavaScript with a JavaScript MIME type; it reads no script properties or Google files and accepts no filename or caller-supplied code. The normal bridge page still checks the website origin, and the JavaScript still checks its top window, channel, message origin, and permitted operations. The route uses [Google's Content Service](https://developers.google.com/apps-script/guides/content), which redirects the static response to a Google content URL. HTML continues to contain only an external script reference.

The bridge repair is installed in the existing Google project. Its generated **Client.gs** is separate from the new private artist **AssetCatalog.gs**. Bridge changes require rebuilding Client.gs; artist file changes require rebuilding the asset catalog. Save affected Google sources and update the existing deployment while preserving its `/exec` URL, account, Anyone access, permissions, properties, and folder IDs. Do not rerun setup or grant new scopes.

While GitHub Pages is offline, the optional owner page's external assets remain unavailable. Direct Drive uploads, collection checks in the Apps Script editor, and `local-test.html` remain available. The visitor bridge is verified from an explicitly allowed local HTTP origin while the public website remains offline. **`UPLOADS_PAUSED=true` blocks visitor bootstrap, uploads, and completion**; the current value is **false**, explicitly approved for live testing. Publishing frontend files or changing the service's pause state requires the user's instruction.

## Remaining live workflow checks

The existing Google service is active as explicitly approved, and the frontend remains local. The user has reported successful manual generation; the checks below still need independent archive confirmation. The automated tests, connected bridge, and successful displayed result do not replace the consent, duplicate, and folder checks. Use the local HTTP website. At least two distinct usable bases are required to test another pairing. Do not repeat setup or change the pause setting to begin testing.

1. The Version 7 owner refresh verified all **113** selected assets against the source index with zero unmatched entries, and fresh production bootstrap completed after Retry. A real website asset passed direct HTTP loading/hash checks in both colour modes with simulated storage. Verify the live end-to-end archive separately, then check a later catalog change, missing/mismatched asset failure without Drive fallback, and duplicate-file handling using the artist-file steps above.
2. After the consent-retention revision is deployed, open `double-exposure.html` in a genuinely signed-out/private browser. Confirm neither answer is selected and upload/camera controls are unavailable. Select No, set colour, and choose a fresh distinct photo. Verify that the preview can appear while all result controls remain locked; transient save failures retry without changing the original reference, base, consent, or JPEG.
3. For that fresh No submission, verify there is no Drive original and no new Sources row, but a completed JPEG exists in Completed_double_exposures. Its Submissions originalId is the opaque `unretained:<sha256>` reference with allowReuse=false. The input must not join future pairings.
4. Select Yes for a fresh distinct photo. Confirm its original is retained in participant_uploads, remains there after completion, and becomes participant-base eligible only after its result is saved. Nothing moves to My_photos and no duplicate original is created. A random draw need not select it immediately.
5. For both Yes and No, use Create another double exposure using this photo and change the saved colour mode. Confirm the original reference and frozen browser File stay the same, consent is inherited, and no second original is sent. No must still have no Drive original or Sources entry. Test a renamed byte-identical retained input, an existing artist base, and repeated completed JPEGs without creating duplicate stored files or bulk-changing legacy archives. A previously retained participant original may move from My_photos to participant_uploads on a new Yes completion, keeping its ID and bytes; an artist-kind duplicate must keep its existing name and location.
6. Retry an interrupted save. Confirm that an unconfirmed preview remains with Retry saving and stable submission/base/result identity, without allowing a download or falsely reporting success. A changed or removed assigned artist photo must fail clearly rather than silently replace the base.
7. Change **Black and white** on a saved result in both directions. Confirm a new submission ID with the same original, pinned base, and consent, no additional original copy, and an archived JPEG matching the displayed colour mode. The earlier result must remain unchanged. An identical JPEG should reuse its existing archived file. Retry a failed variant without selecting a new base or changing its JPEG/recipe.
8. Verify `/exec?view=artist` denies signed-out and different-account visitors while the project owner can use it. Do not treat another signed-in browser as an anonymous test.
9. Test library selection, camera capture, cancellation, and portrait input on actual phones/tablets. Desktop layout tests do not prove camera-picker or HEIC-conversion behavior.
10. The Version 11 studio loaded for the project owner, denied anonymous access, and confirmed synthetic reference/trial saves plus a later contrast adjustment in its private personal folder. Different-account denial, real-network retry recovery, and physical-device downloads remain separate live checks; automated tests cover exact JPEG retries, no separate source uploads, and visitor pool/index isolation.

Do not describe the real archive workflow as tested until these checks pass. If the user wants to close the active service, set `UPLOADS_PAUSED=true` at their request; do not silently change it because a check remains unfinished.

## Archive behavior and later updates

Fresh participant inputs are validated and SHA-256 hashed on the server. A Yes original is retained with its validated bytes; a No original is processed transiently and never saved to Drive or Sources. Identical retained originals and completed JPEGs reuse verified existing files; changing a filename does not change its hash. Completed JPEGs retain their existing deduplication and interrupted-write recovery safeguards. Earlier stored originals are not deleted.

This identity check covers identical file bytes. Cropping, resizing, re-exporting, changing embedded metadata, or camera-picker conversion can change those bytes; detecting every visually similar version cannot be guaranteed by exact hashing. The program does not trust a browser-supplied fingerprint to substitute a different archived original. Copies manually created by dragging the same file into Drive are detected and receive only one eligible pool entry, but are not silently deleted. No broader Drive write permission is added for cleanup.

Finished exposures never join the source pool. Under the new policy, a Yes original stays in participant_uploads and becomes eligible as a participant base only after a completed result. No stores only the finished result and its Submissions metadata, with opaque `unretained:<sha256>` as originalId and no original Drive file or Sources row. Authenticated re-pairing and colour variants reuse that reference and the same frozen browser File; no second original is sent. There is no bulk migration or deletion of existing originals, including older No files. An earlier retained participant original can move from My_photos to participant_uploads on a new authorized Yes completion with the same ID and bytes; artist-kind originals stay in My_photos unchanged. Do not clear the participant folder wholesale or renumber/delete index rows; it also contains active consented bases.

Retry saving keeps the same submission, original reference, assigned base, rendered JPEG, consent, and settings in the open browser session. A No reference is `unretained:<sha256>`, not a Drive file ID; retain the same frozen File for that session. A preview does not prove saving finished. Keep the tab open until the saving message clears and controls unlock. Closing can interrupt a save; a Yes original may remain pending, while No has no retained original to recover from. The existing Sources/Submissions schemas and authenticated retry safeguards remain; do not manually edit hashes, consent, tokens, or the Usage ledger.

The public image treatment remains Saved Current, contrast 12, 0/0 EV. forceBlackAndWhite supplies the initial colour radio selection. Visitors explicitly choose Yes or No for original retention/future shared-base use and choose colour before selecting a photo. Result actions and colour radios remain disabled until current saves are confirmed. A later colour change uses a new submission ID with authenticated reuse.sameBase=true, the same original reference, pinned base, and frozen choice; it sends no second original and does not replace earlier results. This includes unretained No references and the same frozen browser File. Original bytes and the renderer remain unchanged; local experimental sliders stay separate.

Later backend edits require saving the Google files and deploying a new version through **Manage deployments → Edit → New version**. Keeping the deployment preserves its `/exec` address. Frontend publication is separate; the approved November 1 snapshot is live, and later pushes require a new instruction. The public repository is a selected copy, not a mirror of the working repository: GitHub edits do not sync locally, and local saves or commits do not publish. Compare remote and local changes before replacing public files. A local file edit does not update either service automatically.

To undo only the fast-scan revision, preserve current work, restore its affected files from local checkpoint **`89746ec`**, and select the existing Google deployment's **Version 4**. Local Git and the deployed Google version are separate; neither action changes the other environment or the current pause property. Older history also remains: the direct-folder **Version 1** is paired with local checkpoint **`23fad50`**, the import-page implementation with **`6e966b3`**, and **`before-limited-drive-access`** with **`f458bb2`**. Those are broader historical rollbacks. Restoring local files does not republish GitHub Pages or revoke an OAuth grant.

For the static-artist migration specifically, checkpoint **`29b2d1b`** and Google **Version 6** preserve the previous delivery path. Preserve later work before restoring recorded local files; select the Google version separately. Keep all original Drive files and working IDs.

## Intake and storage limits

The intake revision first removed the daily submission-count and new-file-byte caps in Google Version 10; Version 12 preserves that behavior. Saved source and deployment settings were verified for the successive releases. The remaining optional Script Properties control visitor intake:

| Property | Default | Effect |
| --- | --- | --- |
| `REQUESTS_PER_MINUTE` | `120` | Global visitor API attempts per fixed UTC minute, including retries and connection checks |
| `UPLOADS_PAUSED` | `false` | Set true to close visitor requests while keeping owner setup/checks available |

No application-level daily submission or byte quota is enforced in this revision; legacy `SUBMISSIONS_PER_DAY` and `UPLOAD_BYTES_PER_DAY` values do not impose caps. The private Usage ledger remains for durable write identity, deduplication, and interrupted-write recovery, without daily quota accounting. Keep the configurable global per-minute limiter at its default 120 requests, including retries and connection checks. The owner pause switch and per-file size/type/hash validation are unchanged.

The project account's storage and Google service quotas still apply. Public results use up to 2,400 pixels on the longest edge and JPEG uploads up to 12 MB. Large collections and sustained traffic need a real load check. Google Sheets also has per-user API quotas, so bounded image reads alone do not establish a supported collection or visitor capacity.

Google references: [web apps](https://developers.google.com/apps-script/guides/web), [authorization](https://developers.google.com/apps-script/guides/services/authorization), [HTML-service RPC](https://developers.google.com/apps-script/guides/html/communication), [external assets](https://developers.google.com/apps-script/guides/html/restrictions), [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas), [Sheets quotas](https://developers.google.com/workspace/sheets/api/limits).
