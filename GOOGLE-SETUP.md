# Connect the limited-access Google archive

The image effect already works without Google in `local-test.html`. The Google connection supplies base photographs and saves originals, finished exposures, consent, and duplicate checks. It runs on Google's infrastructure; you do not rent a server or connect your Google account to an AI assistant.

The public website exists at [Double exposure](https://aaronlinguini.github.io/double-exposure-online-project/), with [a separate public repository](https://github.com/aaronlinguini/double-exposure-online-project). **On October 30, 2026, the five limited-access files were installed and saved in the existing Google Apps Script project, then read back after reloading and verified against the local files.** Drive v3 and Sheets v4 appear in Services. The four old folder-ID properties were backed up and removed; `SITE_URL`, `ALLOWED_ORIGINS`, and `UPLOADS_PAUSED=true` were retained. No spreadsheet ID existed. The first `setupProject` run stopped at **Authorization required**; no permission was approved, no new archive was created, and the new backend has not been deployed. The existing Google editor is ready for the owner's permission review. `project-config.js` still has an empty endpoint, and uploads remain disabled until setup is finished. The Google connection needs the manual live check below; automated tests simulate Google services.

The pre-install Google files, old Script Properties, and installation verification are backed up locally under the Git-ignored `secrets/google-before-limited-access-2026-10-30/` directory. Existing Drive folders and their contents were not changed. The obsolete permission-request tab for the older code was closed without approval. For this existing project, continue at section 4; sections 2–3 remain instructions for a fresh installation or migration.

## What permission the program requests

The new manifest contains only these OAuth scopes:

| Scope | Purpose |
| --- | --- |
| `https://www.googleapis.com/auth/drive.file` | Create and access the project's app-created Drive files, folders, and index spreadsheet |
| `https://www.googleapis.com/auth/userinfo.email` | Verify that artist operations are performed by the project's owner |
| `https://www.googleapis.com/auth/script.external_request` | Download authorized source-image bytes from Google's fixed Drive API endpoint |

There is no account-wide `drive` or `spreadsheets` scope. Sheets operations use the Sheets API with `drive.file`; they do not request access to every spreadsheet. The external-request scope is a network permission, not full Drive access. The implementation uses it only for the fixed Google Drive media endpoint, keeps its Google token on Google's side, and does not accept a caller-supplied download URL.

The program also checks that each file is app-authorized and carries this project's private marker. **A folder ID alone does not grant access.** Manually creating a folder or dropping a new photograph into one does not authorize that photograph. Artist photographs are imported from your device through the owner-only page so the program creates and indexes its own authorized files.

Google documentation: [Drive per-file scope](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Sheets scope choices](https://developers.google.com/workspace/sheets/api/scopes), [advanced services](https://developers.google.com/apps-script/guides/services/advanced).

## 1. Prepare the public files

Run this in the working project:

```sh
node scripts/prepare-public-site.cjs
```

Publish only the generated `.public-site/` contents to the website repository. This release contains the original seven runtime files plus the artist page's two external assets:

- `index.html`
- `styles.css`
- `scripts.js`
- `project-config.js`
- `archive-workflow.js`
- `drive-storage.js`
- `drive-bridge.js`
- `artist-import.js`
- `artist-import.css`

Do not publish the working repository, its history, test pages, private photographs, or `google-apps-script/`. The artist JavaScript and CSS contain no credentials; the owner-only HTML is served by Google after its owner check. Both the page request and every artist RPC are checked on the server.

The site base is `https://aaronlinguini.github.io/double-exposure-online-project/`. Keep the repository path and trailing slash. The bridge and artist assets must be accessible under this same base. Rebuild the generated directory after public-source edits.

## 2. Install the new files in Apps Script

You perform these steps in [Google Apps Script](https://script.google.com/). Reuse your existing `setupProject_` project. The title's underscore is unrelated to the function names.

1. Replace **Code.gs** with [google-apps-script/Code.gs](google-apps-script/Code.gs).
2. Add a **Script** file named **Storage** and copy [google-apps-script/Storage.gs](google-apps-script/Storage.gs) into it.
3. Add or replace the **HTML** file **Bridge** using [google-apps-script/Bridge.html](google-apps-script/Bridge.html).
4. Add an **HTML** file named **Artist** using [google-apps-script/Artist.html](google-apps-script/Artist.html).
5. In **Project Settings**, enable **Show appsscript.json manifest file in editor**. Replace that file with [google-apps-script/appsscript.json](google-apps-script/appsscript.json), then save the project.
6. Check **Services** in the editor. **Drive API v3** and **Google Sheets API v4** must be enabled, as declared in the new manifest. Add any missing service with **Services → +**. With an Apps Script default Cloud project, adding an advanced service enables its corresponding API. With a custom Cloud project, also enable the Drive and Sheets APIs in that project's Google Cloud console.

The editor should now contain **Code.gs**, **Storage.gs**, **Bridge.html**, **Artist.html**, and **appsscript.json**. Do not mix the older Code.gs or manifest with this release. Do not replace the `__...__` markers in the HTML: the server fills them using the configured site base. Authored JavaScript and CSS remain external.

**Replace the old manifest before authorizing anything.** If Google asks for access to all Drive files or all spreadsheets, stop and check the installed files and manifest. If you previously approved the older broad request, revoke that project's connection yourself through **Google Account → Security → Your connections to third-party apps and services**, then authorize the new version when running setup. Revoking a grant does not delete your Drive files. Do not revoke an unrelated application.

## 3. Configure the site and migrate old folder settings

In Apps Script, open **Project Settings → Script Properties**:

| Property | Value |
| --- | --- |
| `SITE_URL` | `https://aaronlinguini.github.io/double-exposure-online-project/` |
| `UPLOADS_PAUSED` | `true` until you are ready for the live check |
| `ALLOWED_ORIGINS` | Optional local previews, for example `http://127.0.0.1:5500,http://localhost:5500` |

Keep any existing colour-independent intake settings you want to retain. They are described below.

For the first migration from the earlier manual-folder setup, **record the old IDs somewhere private, then remove these Script Properties as one group**:

- `EXPOSURE_ROOT_FOLDER_ID`
- `EXPOSURE_ARTIST_FOLDER_ID`
- `EXPOSURE_ORIGINALS_FOLDER_ID`
- `EXPOSURE_RESULTS_FOLDER_ID`
- `EXPOSURE_SPREADSHEET_ID`, if present

These old IDs point to files created outside the limited-access app. They do not become authorized by copying them into JavaScript or Script Properties. This migration does not delete, move, or change sharing on the old folders, their contents, or any old index.

The new setup creates this separate private project:

```text
Double_exposure_web_project (app)
├── My_photos
├── participant_uploads
├── Completed_double_exposures
└── Double exposure index
```

Use the new links returned by setup or the artist page. Earlier links to the manually created folders are not the new app's archive. **After successful limited-access setup, keep the new `EXPOSURE_*_ID` properties.** Removing them again would start another archive.

## 4. Run setup and review the limited permission request

1. Open **Code.gs** in the Apps Script editor.
2. In the function selector beside **Run**, choose **`setupProject`**, without a trailing underscore.
3. Click **Run**, review Google's requested access yourself, and authorize only if you accept that access.
4. Wait for **Execution completed** in the execution log. If authorization interrupted the run, run `setupProject` again.

The log prints links to the new folders and index spreadsheet. The spreadsheet has **Sources**, **Submissions**, and **Usage** tabs. Setup does not make them public. Running setup again reuses the saved app-created files.

Google may still display an unverified-app notice. It means Google has not verified the app, not that the new permissions are account-wide. Check the actual requested access. This walkthrough is not a reason to bypass a warning without reviewing it.

## 5. Deploy, then import your base photographs

In Apps Script, choose **Deploy → New deployment → Web app**:

- **Execute as:** Me, the archive owner.
- **Who has access:** Anyone, including visitors not signed into Google.

The public visitor endpoint supports only the archive workflow. The artist page separately checks the signed-in owner's identity. Some Workspace organizations prohibit anonymous web apps; that restriction must be resolved before launch.

Copy the deployed URL ending in **`/exec`**. Do not use `/dev`, which is an editor-only test deployment.

To add your base photographs, open that URL with **`?view=artist`** appended, for example:

```text
https://script.google.com/macros/s/YOUR-DEPLOYMENT-ID/exec?view=artist
```

Sign into the account that owns the Apps Script project. Choose photographs from your device and press **Import photographs**. Imports preserve the original bytes, add usable base photos to the index automatically, and skip identical files rather than creating extra copies. Partial batch failures are shown per file; retry explicitly if needed. A timed-out confirmation may already have saved the file, so the retry checks for the existing copy.

Accepted formats are JPEG, PNG, WebP, and AVIF, up to 30 MB each. Export HEIC and RAW first. The **Check collection** button checks the app's known collection and removals; it does not grant access to new files manually dropped into Drive. The owner can also run `refreshArtistCollection` from the editor for that check. Owner imports remain available while visitor uploads are paused and do not consume the visitor intake allowance.

Import at least one photo different from the participant's upload; two distinct bases are needed to test **Try another pairing**. Keep the archive folders and spreadsheet private. Eligible source photographs are supplied through the visitor API to make new exposures, even though there is no public gallery.

## 6. Connect the public website

Set `googleScriptUrl` in `project-config.js` to your deployed `/exec` URL. Preserve the other options:

```js
const EXPOSURE_CONFIG = Object.freeze({
  googleScriptUrl: "https://script.google.com/macros/s/YOUR-DEPLOYMENT-ID/exec",
  forceBlackAndWhite: true,
  connectionTimeoutMs: 30000,
  requestTimeoutMs: 120000
});
```

Rebuild `.public-site/` and publish the updated public files through GitHub Pages. The deployment URL is public configuration, not a password or token. Google tokens remain in the private Google program and are never sent to the participant or artist JavaScript.

## 7. Run the live check

After setup, deployment, artist imports, and website configuration are complete, set Script Property **`UPLOADS_PAUSED`** to **`false`** and save. Keep it `true` while preparation is incomplete.

1. Open the public site in a private window without signing that visitor into Google. Upload a different photo, leave future reuse unchecked, and wait for **Double exposure saved**.
2. Verify the original in the new **participant_uploads** folder and the JPEG in **Completed_double_exposures**. In **Submissions**, verify `status = complete`, `allowReuse = false`, and the original, base, and result IDs. The participant source must remain ineligible for future pairing.
3. Download the result and compare it to the archived JPEG. The site downloads the same blob it sent to the archive, before optional finished-image rotation.
4. Submit a different photo with future reuse checked. Its source becomes eligible only after its finished result is saved. A random future pairing may select it; selection is not guaranteed immediately.
5. Submit an identical original again and use **Try another pairing**. Confirm that each exposure gets its own completed record and result, but the identical original is not saved again. Another pairing should avoid its immediately preceding base.
6. Open `/exec?view=artist` anonymously and from a different Google account. Both must be denied; the owner alone can see folder links and import photographs.
7. Test library selection and camera capture on actual phones/tablets, including cancellation and portrait input.

Do not declare the real Google connection tested until these checks pass. If you pause uploads afterward, set `UPLOADS_PAUSED` back to `true`.

## Retries, settings, and later updates

The visitor workflow saves the untouched original, develops a JPEG, then archives that JPEG. It reports success only after Google confirms the completed pairing record. **Retry saving** keeps the same submission, base, original, and result in that open browser session. It does not silently choose a different base. Keep the tab open until saving finishes; closing it or losing the device can leave a pending original without a completed result.

An identical original reuses its existing participant file. Cropped or re-exported photographs have different bytes and count as different files. Finished double exposures never become source photos. A participant original joins the source pool only with their opt-in and a completed result. Set `INCLUDE_PARTICIPANT_PHOTOS` to `false` to disable all participant bases while continuing to archive originals and results.

The saved public image treatment is still **Saved Current, contrast 12, 0/0 EV**. `forceBlackAndWhite` in `project-config.js` controls monochrome output; original uploaded files are preserved. Local experimental sliders remain local.

For a local HTTP preview, add the exact preview origin to `ALLOWED_ORIGINS`; `SITE_URL` must still be the published HTTPS site so Google can load the external assets. `file://` cannot connect to the archive.

For backend changes, replace the saved Google files and use **Manage deployments → Edit → New version**. Retaining the deployment preserves its `/exec` address. Frontend changes are published through GitHub Pages. A saved local file does not automatically update Google or GitHub.

The complete prior project is preserved as **`before-limited-drive-access`**, commit **`f458bb2`**. Reverting local code does not itself change a deployed Google version or revoke an OAuth grant; those are separate manual operations.

## Intake and storage limits

These optional Script Properties control visitor intake:

| Property | Default | Effect |
| --- | --- | --- |
| `REQUESTS_PER_MINUTE` | `120` | Global visitor API requests per fixed UTC minute, including retries and connection checks |
| `SUBMISSIONS_PER_DAY` | `200` | New visitor submissions per UTC day, including another pairing; retries reuse their submission |
| `UPLOAD_BYTES_PER_DAY` | `1073741824` | Newly stored visitor original/result bytes per UTC day; duplicates and recovered files are not charged again |
| `UPLOADS_PAUSED` | `false` | Set to `true` to temporarily close visitor requests; owner setup and imports still work |

The daily byte limit is **an adjustable intake allowance, not a 1 GB total archive limit**. It does not change your Google storage plan. Counters reset at midnight UTC. A reached allowance can pause completion after an original was saved; its retry can finish after the allowance resets or is raised. These limits contain global usage, not per-person fairness or every form of abuse.

The private **Usage** tab reserves submissions and new files before writes. Retries reuse reservations; abandoned attempts may conservatively consume allowance. An unused reservation from an earlier day must fit today's allowance before a new file is created. Existing files are not charged retroactively. Do not edit Usage or the internal `EXPOSURE_REQUEST_WINDOW` property. Missing optional settings use defaults; malformed settings or accounting close visitor uploads until corrected.

The project uses the owning account's storage and Apps Script quotas. Originals keep their uploaded resolution; working images and results use up to 2,400 pixels on the longest edge. Finished JPEG uploads are limited to 12 MB. Large archives and sustained visitor traffic require a live load check.

Google documentation: [Web apps](https://developers.google.com/apps-script/guides/web), [authorization and revoking grants](https://developers.google.com/apps-script/guides/services/authorization), [HTML-service RPC](https://developers.google.com/apps-script/guides/html/communication), [external asset requirements](https://developers.google.com/apps-script/guides/html/restrictions), [quotas](https://developers.google.com/apps-script/guides/services/quotas).
