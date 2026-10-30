/*
 * Private Drive archive + Sheets index for the double-exposure project.
 * Runs in a dedicated project account. My_photos contains artist bases and
 * completed, opted-in participant originals; unshared originals remain private
 * in participant_uploads. Each original file is stored once and moved, not
 * copied, when it joins the pool. Completed exposures have their own folder.
 * Archive writes remain limited to app-created files.
 * Run setupProject, then add base photographs directly in the Drive folder.
 * No operation changes Drive sharing settings.
 *
 * Script properties:
 * PROJECT_OWNER_EMAIL: dedicated project account that executes this program.
 * SITE_URL: full HTTPS site base, including its GitHub repository path.
 * ALLOWED_ORIGINS: optional comma-separated exact extra origins (local HTTP
 *                 origins are allowed for development; wildcards are not).
 * INCLUDE_PARTICIPANT_PHOTOS: "false" disables all participant bases. Otherwise
 *                           only completed, individually opted-in originals join.
 * UPLOADS_PAUSED: "true" temporarily closes the visitor API; absent/"false" opens it.
 * REQUESTS_PER_MINUTE / SUBMISSIONS_PER_DAY / UPLOAD_BYTES_PER_DAY: optional
 * positive integer limits, shared by all visitors (defaults 120 / 200 / 1 GiB).
 * EXPOSURE_REQUEST_WINDOW is internal request accounting. The private Usage
 * sheet reserves each submission and new file once; do not edit its records.
 * EXPOSURE_*_ID properties are populated by setupProject_.
 *
 * Sources columns: sourceId, sha256, nameJson, mimeType, byteLength, kind,
 *                  eligible, createdAt, modifiedAt. kind is artist or participant.
 * Submissions columns: submissionId, token, originalId, originalSha256, baseId,
 *   status, resultId, resultSha256, width, height, settingsJson, createdAt,
 *   completedAt, allowReuse, parentSubmissionId, baseSha256. Status progresses pending ->
 *   paired -> saving -> complete. Blank allowReuse on older rows means false.
 * JSON-encoded names cannot become spreadsheet formulas. Dates are ISO strings.
 * Files use deterministic names so a retry can recover a Drive write that
 * succeeded immediately before a Sheet write was interrupted.
 *
 * This is a public submission endpoint, not an authentication boundary for an
 * artist admin. A prior submission token authorizes another pairing of its
 * original. Editor launchers check that the active user is the executing
 * owner. Their internal helpers end in _. Keep this script, its properties,
 * Sheet and folders private.
 */

var EXPOSURE_CONFIG_ = Object.freeze({
  rootName: "Double_exposure_web_project (app)",
  sheetName: "Double exposure index",
  maxOriginalBytes: 30 * 1024 * 1024,
  maxResultBytes: 12 * 1024 * 1024,
  artistRefreshMs: 60000,
  maxArtistReads: 10,
  maxArtistReadBytes: 64 * 1024 * 1024,
  maxArtistFingerprintProbes: 150,
  maxArtistScanMs: 25000,
  usageHeaders: ["key", "day", "kind", "bytes"],
  sourcesHeaders: ["sourceId", "sha256", "nameJson", "mimeType", "byteLength", "kind", "eligible", "createdAt", "modifiedAt"],
  submissionsHeaders: ["submissionId", "token", "originalId", "originalSha256", "baseId", "status", "resultId", "resultSha256", "width", "height", "settingsJson", "createdAt", "completedAt", "allowReuse", "parentSubmissionId", "baseSha256"]
});

function doGet(e) {
  try {
    var parameters = e && e.parameter ? e.parameter : {};
    if (parameters.asset !== undefined) {
      if (parameters.asset !== "bridge") throw apiError_("INVALID_ASSET", "This archive asset is unavailable.");
      return ContentService.createTextOutput("(" + exposureBridgeClient_.toString() + ")();\n")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    var config = siteConfig_();
    if (parameters.view === "artist") {
      requireOwner_();
      var artistHtml = HtmlService.createHtmlOutputFromFile("Artist").getContent();
      artistHtml = artistHtml.split("__ARTIST_SCRIPT_URL__").join(escapeHtml_(config.siteUrl + "artist-import.js?v=drive-file-v1"));
      artistHtml = artistHtml.split("__ARTIST_STYLE_URL__").join(escapeHtml_(config.siteUrl + "artist-import.css?v=drive-file-v1"));
      // Retain Google's default framing protection for the owner page.
      return HtmlService.createHtmlOutput(artistHtml).setTitle("Artist photograph import");
    }
    var origin = String(parameters.origin || "");
    var channel = String(parameters.channel || "");
    if (config.origins.indexOf(origin) < 0 || !/^[a-zA-Z0-9_-]{16,100}$/.test(channel)) {
      throw apiError_("INVALID_BRIDGE", "This archive connection is not allowed.");
    }
    var html = HtmlService.createHtmlOutputFromFile("Bridge").getContent();
    var replacements = {
      "__PARENT_ORIGIN__": origin,
      "__CHANNEL__": channel,
      "__BRIDGE_SCRIPT_URL__": bridgeScriptUrl_()
    };
    Object.keys(replacements).forEach(function (token) {
      html = html.split(token).join(escapeHtml_(replacements[token]));
    });
    return HtmlService.createHtmlOutput(html)
      .setTitle("Exposure archive connection")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    return HtmlService.createHtmlOutput(error && error.exposureCode_ === "OWNER_REQUIRED"
      ? "Open the artist import page while signed into the account that deployed this project."
      : "The exposure archive connection is unavailable.");
  }
}

function bridgeScriptUrl_() {
  var url = ScriptApp.getService().getUrl();
  if (typeof url !== "string" || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) {
    throw apiError_("NOT_CONFIGURED", "The archive web app has not been deployed.");
  }
  return url + "?asset=bridge";
}

// The visitor API. No method accepts a caller-selected Drive file ID.
function exposureApi(request) {
  try {
    if (!isObject_(request) || ["bootstrap", "begin", "complete"].indexOf(request.action) < 0) {
      throw apiError_("INVALID_REQUEST", "Choose a valid archive operation.");
    }
    var payload = request.payload === undefined ? {} : request.payload;
    if (!isObject_(payload)) throw apiError_("INVALID_REQUEST", "The archive request is invalid.");
    var data = withLock_(function () {
      guardVisitorRequest_();
      var project = project_();
      if (request.action === "bootstrap") return bootstrap_(project);
      if (request.action === "begin") return begin_(project, payload);
      return complete_(project, payload);
    });
    return { ok: true, data: data };
  } catch (error) {
    var response = {
      code: error && error.exposureCode_ ? error.exposureCode_ : "ARCHIVE_UNAVAILABLE",
      message: error && error.exposureCode_ ? error.message : "The archive is temporarily unavailable. Please retry."
    };
    if (error && error.originalSaved_ === true) response.originalSaved = true;
    return { ok: false, error: response };
  }
}

// This RPC is separate from the anonymous visitor API. Every call verifies
// Google's active caller identity; a client-supplied email is never trusted.
function artistApi(request) {
  try {
    requireOwner_();
    if (!isObject_(request) || ["status", "import", "refresh"].indexOf(request.action) < 0) {
      throw apiError_("INVALID_REQUEST", "Choose a valid collection operation.");
    }
    var payload = request.payload === undefined ? {} : request.payload;
    if (!isObject_(payload)) throw apiError_("INVALID_REQUEST", "The collection request is invalid.");
    var data = request.action === "refresh" ? refreshArtistCollection_() : withLock_(function () {
      var project = project_();
      if (request.action === "status") {
        syncArtistSourcesIfDue_(project);
        return artistStatus_(project);
      }
      return importArtist_(project, imageInput_(payload.image, EXPOSURE_CONFIG_.maxOriginalBytes, false));
    });
    return { ok: true, data: data };
  } catch (error) {
    return { ok: false, error: {
      code: error && error.exposureCode_ ? error.exposureCode_ : "ARCHIVE_UNAVAILABLE",
      message: error && error.exposureCode_ ? error.message : "The collection request could not be confirmed. Please retry."
    } };
  }
}

function artistStatus_(project) {
  return {
    artistCount: readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders).filter(function (source) {
      return source.kind === "artist" && isEligible_(source);
    }).length,
    maxOriginalBytes: EXPOSURE_CONFIG_.maxOriginalBytes,
    folders: {
      root: ArchiveDrive.getFolderById(PropertiesService.getScriptProperties().getProperty("EXPOSURE_ROOT_FOLDER_ID")).getUrl(),
      artist: project.artist.getUrl(), originals: project.originals.getUrl(), results: project.results.getUrl()
    }
  };
}

function importArtist_(project, image) {
  var scan = refreshArtistSources_(project);
  if (!scan.complete) throw apiError_("COLLECTION_REFRESHING", "The photograph collection is still being checked. Please retry in a moment.");
  var sources = readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders);
  var existing = sources.filter(function (source) { return source.sha256 === image.hash; })[0];
  if (existing) {
    readSource_(existing);
    return { imported: false, duplicate: true, artistCount: artistStatus_(project).artistCount, name: image.name };
  }
  rejectArchivedResult_(project, image);
  // Artist uploads are deliberate owner operations, separate from the visitor
  // intake budget. A deterministic name recovers an interrupted index write.
  var filename = "artist-" + image.hash + "." + extension_(image.mimeType);
  var files = project.artist.getFilesByName(filename);
  var duplicate = files.hasNext();
  var file;
  if (duplicate) {
    file = files.next();
    var bytes = file.getBlob().getBytes();
    if (bytes.length !== image.bytes.length || sha256_(bytes) !== image.hash || detectMime_(bytes) !== image.mimeType) {
      throw apiError_("STORAGE_CONFLICT", "An artist photograph could not be verified. Check the collection before retrying.");
    }
  } else {
    var writer;
    try { writer = ArchiveDrive.getFolderById(project.artist.getId()); }
    catch (error) {
      if (error.exposureCode_ === "ACCESS_NOT_GRANTED") throw apiError_("READ_ONLY_SOURCE", "Add photographs directly to the configured Drive folder.");
      throw error;
    }
    file = writer.createFile(Utilities.newBlob(image.bytes, image.mimeType, filename));
  }
  var record = Object.assign({}, existing || { createdAt: now_() }, {
    sourceId: file.getId(), sha256: image.hash, nameJson: JSON.stringify(image.name), mimeType: image.mimeType,
    byteLength: image.bytes.length, kind: "artist", eligible: true, modifiedAt: file.getLastUpdated().toISOString()
  });
  writeRecord_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders, record);
  return { imported: !duplicate, duplicate: duplicate, artistCount: artistStatus_(project).artistCount, name: image.name };
}

// Visible in the editor's Run menu. A public web visitor cannot pass this check.
function setupProject() {
  requireOwner_();
  return setupProject_();
}

function refreshArtistCollection() {
  requireOwner_();
  return refreshArtistCollection_();
}

function requireOwner_() {
  var active = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
  var effective = String(Session.getEffectiveUser().getEmail() || "").trim().toLowerCase();
  if (!active || !effective || active !== effective) {
    throw apiError_("OWNER_REQUIRED", "Open this page while signed into the archive owner's account, or run it in that account's Apps Script editor.");
  }
}

function requireProjectOwner_() {
  var expected = String(PropertiesService.getScriptProperties().getProperty("PROJECT_OWNER_EMAIL") || "").trim().toLowerCase();
  if (!expected || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(expected)) {
    throw apiError_("NOT_CONFIGURED", "Set PROJECT_OWNER_EMAIL to the dedicated project account before running setup.");
  }
  var effective = String(Session.getEffectiveUser().getEmail() || "").trim().toLowerCase();
  if (!effective || effective !== expected) {
    throw apiError_("OWNER_ACCOUNT_MISMATCH", "This program must run in its configured project account.");
  }
}

function setupProject_() {
  requireProjectOwner_();
  return withLock_(function () {
    var properties = PropertiesService.getScriptProperties();
    var rootId = properties.getProperty("EXPOSURE_ROOT_FOLDER_ID");
    var root;
    if (rootId) root = ArchiveDrive.getFolderById(rootId);
    else {
      // A globally same-named folder might already be shared. Start with a new
      // default-private root; all subsequent runs reuse this saved identity.
      root = ArchiveDrive.createFolder(EXPOSURE_CONFIG_.rootName);
      properties.setProperty("EXPOSURE_ROOT_FOLDER_ID", root.getId());
    }
    var artistId = properties.getProperty("EXPOSURE_ARTIST_FOLDER_ID");
    var artist = artistId ? ArchiveDrive.getArtistFolderById(artistId)
      : setupFolder_(root, properties, "EXPOSURE_ARTIST_FOLDER_ID", "My_photos");
    var originals = setupFolder_(root, properties, "EXPOSURE_ORIGINALS_FOLDER_ID", "participant_uploads");
    var results = setupFolder_(root, properties, "EXPOSURE_RESULTS_FOLDER_ID", "Completed_double_exposures");
    var sheetId = properties.getProperty("EXPOSURE_SPREADSHEET_ID");
    var spreadsheet;
    if (sheetId) spreadsheet = ArchiveSheets.openById(sheetId);
    else {
      var existing = root.getFilesByName(EXPOSURE_CONFIG_.sheetName);
      while (existing.hasNext() && !spreadsheet) {
        var candidate = existing.next();
        if (candidate.getMimeType() === "application/vnd.google-apps.spreadsheet") {
          spreadsheet = ArchiveSheets.openById(candidate.getId());
        }
      }
      if (!spreadsheet) spreadsheet = ArchiveSheets.create(EXPOSURE_CONFIG_.sheetName);
      // Save the ID before moving it: a retry still finds a partially set-up Sheet.
      properties.setProperty("EXPOSURE_SPREADSHEET_ID", spreadsheet.getId());
    }
    ArchiveDrive.getFileById(spreadsheet.getId()).moveTo(root);
    setupSheet_(spreadsheet, "Sources", EXPOSURE_CONFIG_.sourcesHeaders);
    setupSheet_(spreadsheet, "Submissions", EXPOSURE_CONFIG_.submissionsHeaders);
    setupSheet_(spreadsheet, "Usage", EXPOSURE_CONFIG_.usageHeaders);
    var links = { root: root.getUrl(), artist: artist.getUrl(), originals: originals.getUrl(), results: results.getUrl(), sheet: spreadsheet.getUrl() };
    console.log(JSON.stringify(links));
    return links;
  });
}

function refreshArtistCollection_() {
  return withLock_(function () { return refreshArtistSources_(project_()); });
}

function syncArtistSourcesIfDue_(project) {
  var last = Date.parse(PropertiesService.getScriptProperties().getProperty("EXPOSURE_ARTIST_REFRESHED_AT") || "");
  var now = Date.now();
  if (Number.isFinite(last) && last <= now && now - last < EXPOSURE_CONFIG_.artistRefreshMs) return;
  return refreshArtistSources_(project);
}

function pinLegacyBases_(project, sources) {
  var byId = {};
  sources.forEach(function (source) { byId[source.sourceId] = source; });
  var submissions = readRecords_(project.submissions, EXPOSURE_CONFIG_.submissionsHeaders), updates = [];
  submissions.forEach(function (submission) {
    var source = byId[submission.baseId];
    if (submission.baseId && !submission.baseSha256 && source && /^[0-9a-f]{64}$/.test(source.sha256)) {
      submission.baseSha256 = source.sha256;
      updates.push(submission);
    }
  });
  writeRecordUpdates_(project.submissions, EXPOSURE_CONFIG_.submissionsHeaders, submissions, updates);
}

// The caller already holds the script lock. Listing completes before any index
// changes, and bounded header probes avoid downloading every new base in full.
function refreshArtistSources_(project) {
  var existing = readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders);
  var byId = {};
  existing.forEach(function (source) { byId[source.sourceId] = source; });
  var retainedIds = {}, seenHashes = {}, updates = [];
  var skipped = 0, preserved = 0, deferred = 0, reads = 0, readBytes = 0;
  var probes = 0, deadline = Date.now() + EXPOSURE_CONFIG_.maxArtistScanMs;
  var complete = true, issues = [], omittedIssues = 0;
  // Owner diagnostics identify skipped files without recording image contents,
  // file IDs, authorization tokens, or exception details. Keep logs bounded.
  function issue(file, reasonCode, size, mimeType, detectedMime) {
    if (issues.length >= 50) { omittedIssues++; return; }
    var name = "Photograph";
    try { name = cleanName_(file.getName()); } catch (error) { /* Metadata may be unavailable. */ }
    var item = { name: name, reasonCode: reasonCode,
      bytes: Number.isFinite(size) ? size : null, mimeType: String(mimeType || "") };
    if (detectedMime !== undefined) item.detectedMime = detectedMime;
    issues.push(item);
  }
  var submissions = readRecords_(project.submissions, EXPOSURE_CONFIG_.submissionsHeaders);
  var files = project.artist.getFiles();
  function preserve(fileId) {
    var previous = byId[fileId];
    if (!previous || previous.kind !== "artist") return;
    retainedIds[fileId] = true;
    if (isEligible_(previous) && !seenHashes[previous.sha256]) {
      seenHashes[previous.sha256] = true;
      preserved++;
    }
  }
  while (files.hasNext()) {
    var file = files.next(), fileId = "", size = null, mimeType = "";
    try {
      fileId = file.getId();
      size = file.getSize(); mimeType = file.getMimeType();
      var invalidReason = !Number.isSafeInteger(size) || size < 1 ? "INVALID_IMAGE_SIZE"
        : size > EXPOSURE_CONFIG_.maxOriginalBytes ? "IMAGE_TOO_LARGE"
        : !/^image\/(jpeg|png|webp|avif)$/.test(mimeType) ? "UNSUPPORTED_IMAGE" : "";
      if (invalidReason) { skipped++; issue(file, invalidReason, size, mimeType); continue; }
      var modifiedAt = file.getLastUpdated().toISOString();
      var previous = byId[fileId];
      // Moving a participant original into the pool never makes it an artist
      // photograph. A private role marker also protects an orphaned index row.
      var participant = previous && previous.kind === "participant";
      if (participant || file.isParticipantPhoto()) {
        retainedIds[fileId] = true;
        if (!participant) { complete = false; skipped++; issue(file, "CONSENT_RECORD_MISSING", size, mimeType); continue; }
        var consented = submissions.some(function (submission) {
          return submission.originalId === fileId && submission.originalSha256 === previous.sha256 &&
            submission.status === "complete" && (submission.allowReuse === true || submission.allowReuse === "true");
        });
        var unchangedParticipant = previous.modifiedAt === modifiedAt && Number(previous.byteLength) === size && previous.mimeType === mimeType;
        if (!unchangedParticipant) {
          if (reads >= EXPOSURE_CONFIG_.maxArtistReads || readBytes + size > EXPOSURE_CONFIG_.maxArtistReadBytes) {
            complete = false; deferred++; issue(file, "SCAN_DEFERRED", size, mimeType); continue;
          }
          reads++; readBytes += size;
          var participantBytes = file.getBlob().getBytes();
          unchangedParticipant = participantBytes.length === size && sha256_(participantBytes) === previous.sha256 && detectMime_(participantBytes) === previous.mimeType;
        }
        var participantRecord = Object.assign({}, previous, {
          eligible: consented && unchangedParticipant,
          modifiedAt: unchangedParticipant ? modifiedAt : previous.modifiedAt
        });
        if (EXPOSURE_CONFIG_.sourcesHeaders.some(function (key) { return previous[key] !== participantRecord[key]; })) updates.push(participantRecord);
        if (!participantRecord.eligible) {
          skipped++;
          issue(file, unchangedParticipant ? "CONSENT_NOT_GRANTED" : "SOURCE_CHANGED", size, mimeType);
        }
        continue;
      }
      // An interrupted managed write moved manually into this folder is not a
      // new artist contribution. Its missing archive record needs repair.
      if (!previous && /^(?:source-[0-9a-f]{64}\.|result-[0-9a-f-]+\.|participant_photo_\d+\.)/i.test(file.getName())) {
        complete = false; skipped++; issue(file, "ARCHIVE_RECORD_MISSING", size, mimeType); continue;
      }
      var driveHash = typeof file.getSha256Checksum === "function" ? file.getSha256Checksum() : "";
      var unchanged = previous && previous.kind === "artist" && previous.modifiedAt === modifiedAt &&
        Number(previous.byteLength) === size && previous.mimeType === mimeType && /^[0-9a-f]{64}$/.test(previous.sha256) &&
        (!driveHash || driveHash === previous.sha256);
      var hash;
      if (unchanged) hash = previous.sha256;
      else {
        var fast = /^[0-9a-f]{64}$/.test(driveHash) && /^image\/(jpeg|png|webp)$/.test(mimeType) &&
          typeof file.getScanFingerprint === "function";
        // Reserve enough fallback capacity in case Drive returns a full HTTP 200.
        if (Date.now() >= deadline || reads >= EXPOSURE_CONFIG_.maxArtistReads ||
            readBytes + size > EXPOSURE_CONFIG_.maxArtistReadBytes || fast && probes >= EXPOSURE_CONFIG_.maxArtistFingerprintProbes) {
          complete = false; deferred++; preserve(fileId); issue(file, "SCAN_DEFERRED", size, mimeType); continue;
        }
        if (fast) {
          probes++;
          var fingerprint = file.getScanFingerprint();
          if (fingerprint && fingerprint.fullRead) { reads++; readBytes += fingerprint.transferredBytes; }
          if (!fingerprint || fingerprint.sha256 !== driveHash) throw new Error("Changed source fingerprint");
          var headerMime = detectMime_(fingerprint.header);
          if (headerMime !== mimeType) {
            skipped++; issue(file, "CONTENT_TYPE_MISMATCH", size, mimeType, headerMime); continue;
          }
          hash = fingerprint.sha256;
        } else {
          reads++; readBytes += size;
          var bytes = file.getBlob().getBytes();
          var detectedMime = detectMime_(bytes);
          if (bytes.length !== size || detectedMime !== mimeType) {
            skipped++;
            issue(file, bytes.length !== size ? "CONTENT_LENGTH_MISMATCH" : "CONTENT_TYPE_MISMATCH", size, mimeType, detectedMime);
            continue;
          }
          hash = sha256_(bytes);
        }
      }
      retainedIds[fileId] = true;
      var record = Object.assign({}, previous || { createdAt: now_() }, {
        sourceId: fileId, sha256: hash, nameJson: JSON.stringify(cleanName_(file.getName())),
        mimeType: mimeType, byteLength: size, kind: "artist", eligible: !seenHashes[hash], modifiedAt: modifiedAt
      });
      if (seenHashes[hash]) { skipped++; issue(file, "DUPLICATE", size, mimeType); }
      seenHashes[hash] = true;
      // Retain duplicate hashes and metadata too, avoiding repeated downloads.
      if (!previous || EXPOSURE_CONFIG_.sourcesHeaders.some(function (key) { return previous[key] !== record[key]; })) updates.push(record);
    } catch (error) {
      if (error.scanFullRead_ && Number.isSafeInteger(error.scanBytes_) && error.scanBytes_ >= 0) {
        reads++; readBytes += error.scanBytes_;
      }
      complete = false; skipped++; preserve(fileId); issue(file, "READ_FAILED", size, mimeType);
    }
  }
  existing.forEach(function (source) {
    if (!retainedIds[source.sourceId] && isEligible_(source)) {
      source.eligible = false;
      updates.push(source);
    }
  });
  writeRecordUpdates_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders, existing, updates);
  if (complete) PropertiesService.getScriptProperties().setProperty("EXPOSURE_ARTIST_REFRESHED_AT", now_());
  var summary = {
    artistCount: readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders).filter(function (source) {
      return source.kind === "artist" && isEligible_(source);
    }).length,
    skipped: skipped, preserved: preserved, deferred: deferred, complete: complete,
    issues: issues, omittedIssues: omittedIssues
  };
  console.log(JSON.stringify(summary));
  return summary;
}

function bootstrap_(project) {
  syncArtistSourcesIfDue_(project);
  var includeParticipants = includeParticipants_();
  var sources = eligibleSources_(project, "", includeParticipants);
  var artistCount = sources.filter(function (source) { return source.kind === "artist"; }).length;
  return {
    totalEligible: sources.length,
    artistCount: artistCount,
    participantCount: sources.length - artistCount,
    includeParticipantPhotos: includeParticipants,
    maxOriginalBytes: EXPOSURE_CONFIG_.maxOriginalBytes,
    maxResultBytes: EXPOSURE_CONFIG_.maxResultBytes
  };
}

function begin_(project, payload) {
  var submissionId = submissionId_(payload.submissionId);
  if (payload.reuse !== undefined && !isObject_(payload.reuse)) {
    throw apiError_("INVALID_REQUEST", "The previous exposure could not be verified.");
  }
  var reusing = isObject_(payload.reuse);
  if (reusing) syncArtistSourcesIfDue_(project);
  if (reusing === (payload.original !== undefined)) {
    throw apiError_("INVALID_REQUEST", "Choose one photograph or one saved exposure to pair.");
  }
  if (reusing && payload.allowReuse !== undefined) {
    throw apiError_("INVALID_REQUEST", "A photograph's sharing choice cannot be changed by another pairing.");
  }
  var submissions = readRecords_(project.submissions, EXPOSURE_CONFIG_.submissionsHeaders);
  var previous = null;
  var original = null;
  var originalHash;
  var allowReuse;
  if (reusing) {
    var previousId = submissionId_(payload.reuse.submissionId);
    previous = findRecord_(submissions, "submissionId", previousId);
    if (!previous || !tokenMatches_(previous.token, payload.reuse.token) || previous.status !== "complete") {
      throw apiError_("INVALID_TOKEN", "The previous exposure could not be verified. Start with a new photograph.");
    }
    originalHash = previous.originalSha256;
    allowReuse = previous.allowReuse === true || previous.allowReuse === "true";
  } else {
    if (payload.allowReuse !== undefined && typeof payload.allowReuse !== "boolean") {
      throw apiError_("INVALID_REQUEST", "The photograph sharing choice is invalid.");
    }
    original = imageInput_(payload.original, EXPOSURE_CONFIG_.maxOriginalBytes, false);
    // Refresh even inside the usual cache window: a file just dropped into
    // Drive must be considered before deciding to save another physical copy.
    var scan = refreshArtistSources_(project);
    if (!scan.complete) throw apiError_("COLLECTION_REFRESHING", "The photograph collection is still being checked. Please retry in a moment.");
    originalHash = original.hash;
    allowReuse = payload.allowReuse === true;
  }
  var submission = findRecord_(submissions, "submissionId", submissionId);
  if (submission && (submission.originalSha256 !== originalHash ||
      (submission.allowReuse === true || submission.allowReuse === "true") !== allowReuse ||
      String(submission.parentSubmissionId || "") !== (previous ? previous.submissionId : ""))) {
    throw apiError_("SUBMISSION_CONFLICT", "This submission already belongs to a different photograph. Start a new submission.");
  }
  if (!submission) {
    reserveUsage_(project, "submission:" + submissionId, "submission", 0);
    var source = previous
      ? findRecord_(readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders), "sourceId", previous.originalId)
      : saveOriginal_(project, original);
    if (!source || source.sha256 !== originalHash) throw apiError_("ARCHIVE_UNAVAILABLE", "The original photograph is unavailable. Please contact the artist.");
    submission = {
      submissionId: submissionId, token: newToken_(), originalId: source.sourceId,
      originalSha256: originalHash, baseId: "", status: "pending", resultId: "",
      resultSha256: "", width: "", height: "", settingsJson: "", createdAt: now_(), completedAt: "",
      allowReuse: allowReuse, parentSubmissionId: previous ? previous.submissionId : "", baseSha256: ""
    };
    writeRecord_(project.submissions, EXPOSURE_CONFIG_.submissionsHeaders, submission);
  }
  try {
    var base, baseHash;
    if (submission.baseId) {
      var assigned = findRecord_(readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders), "sourceId", submission.baseId);
      if (!assigned || !submission.baseSha256 || assigned.sha256 !== submission.baseSha256) {
        throw apiError_("BASE_UNAVAILABLE", "The assigned photograph has changed or is unavailable. Please contact the artist.");
      }
      base = readSource_(assigned);
    } else {
      var excludedBaseHash = "";
      if (previous) {
        var priorBase = findRecord_(readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders), "sourceId", previous.baseId);
        if (!priorBase) throw apiError_("BASE_UNAVAILABLE", "The previous base photograph is unavailable. Please contact the artist.", true);
        excludedBaseHash = previous.baseSha256 || priorBase.sha256;
      }
      var candidates = eligibleSources_(project, originalHash, includeParticipants_(), excludedBaseHash);
      var hadCandidates = candidates.length > 0;
      while (candidates.length && !base) {
        var choice = Math.floor(Math.random() * candidates.length);
        var selected = candidates.splice(choice, 1)[0];
        try { base = readSource_(selected); baseHash = selected.sha256; }
        catch (error) {
          // A Drive read can fail transiently. Skip this candidate only for this
          // request; owner refresh controls persistent collection eligibility.
        }
      }
      if (!base) {
        if (hadCandidates) throw apiError_("BASE_UNAVAILABLE", "Your original was saved, but source photographs could not be read. Please retry.", true);
        if (previous) throw apiError_("NO_ALTERNATIVE_BASE", "There is no different photograph available for another pairing yet.", true);
        throw apiError_("NO_BASE", "Your original was saved. No different source photograph is available yet. Retry after the artist adds photographs.", true);
      }
      submission.baseId = base.id;
      submission.baseSha256 = baseHash;
      submission.status = "paired";
      writeRecord_(project.submissions, EXPOSURE_CONFIG_.submissionsHeaders, submission);
    }
    return { submissionId: submissionId, token: submission.token, originalId: submission.originalId, base: base };
  } catch (error) {
    error.originalSaved_ = true;
    throw error;
  }
}

function complete_(project, payload) {
  var submissionId = submissionId_(payload.submissionId);
  var submission = findRecord_(readRecords_(project.submissions, EXPOSURE_CONFIG_.submissionsHeaders), "submissionId", submissionId);
  if (!submission || !tokenMatches_(submission.token, payload.token)) {
    throw apiError_("INVALID_TOKEN", "This submission could not be verified. Retry the original submission.");
  }
  try {
    if (!submission.baseId) throw apiError_("NO_BASE", "Your original is saved, but it has not been paired yet. Retry the original submission.", true);
    var result = imageInput_(payload.result, EXPOSURE_CONFIG_.maxResultBytes, true);
    var dimensions = dimensions_(payload.width, payload.height);
    var settings = settings_(payload.settings);
    var settingsJson = JSON.stringify(settings);
    if (submission.resultSha256 && (submission.resultSha256 !== result.hash || Number(submission.width) !== dimensions.width || Number(submission.height) !== dimensions.height || submission.settingsJson !== settingsJson)) {
      throw apiError_("RESULT_CONFLICT", "This submission already has a different result. Start a new submission to save another result.", true);
    }
    var sourceMatch = readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders).some(function (source) {
      return source.sha256 === result.hash;
    });
    if (sourceMatch) throw apiError_("RESULT_MATCHES_SOURCE", "The finished exposure is identical to an archived original. No additional copy was saved.");
    if (!submission.resultSha256) {
      submission.resultSha256 = result.hash;
      submission.width = dimensions.width;
      submission.height = dimensions.height;
      submission.settingsJson = settingsJson;
      submission.status = "saving";
      writeRecord_(project.submissions, EXPOSURE_CONFIG_.submissionsHeaders, submission);
    }
    var file = saveResult_(project, result);
    submission.resultId = file.getId();
    submission.status = "complete";
    if (!submission.completedAt) submission.completedAt = now_();
    writeRecord_(project.submissions, EXPOSURE_CONFIG_.submissionsHeaders, submission);
    var original = findRecord_(readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders), "sourceId", submission.originalId);
    if (!original) throw apiError_("ARCHIVE_UNAVAILABLE", "The original's archive record is unavailable. Please retry.", true);
    // Eligibility follows the saved result and this photograph's consent.
    // A retry repairs an interrupted final update without another file write.
    if ((submission.allowReuse === true || submission.allowReuse === "true") && original.kind === "participant") {
      shareParticipantOriginal_(project, original);
    }
    var currentBase = findRecord_(readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders), "sourceId", submission.baseId);
    var alternatives = currentBase ? eligibleSources_(project, submission.originalSha256, includeParticipants_(), submission.baseSha256 || currentBase.sha256) : [];
    return { submissionId: submissionId, saved: true, resultId: file.getId(), originalId: submission.originalId,
      baseId: submission.baseId, canRePair: alternatives.length > 0 };
  } catch (error) {
    error.originalSaved_ = true;
    throw error;
  }
}

function saveOriginal_(project, image) {
  var sources = readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders);
  var matches = sources.filter(function (source) { return source.sha256 === image.hash; });
  if (matches.length) {
    // Reuse an artist's existing photo too. Do not move it, rename it, or store
    // another participant copy of exactly the same original bytes.
    for (var index = 0; index < matches.length; index++) {
      try { readSource_(matches[index]); return matches[index]; }
      catch (error) { /* Try another already indexed copy before failing closed. */ }
    }
    throw apiError_("ARCHIVE_UNAVAILABLE", "This photograph is already recorded but its saved copy could not be verified. Please retry.");
  }
  rejectArchivedResult_(project, image);
  var filename = "source-" + image.hash + "." + extension_(image.mimeType);
  var file = recoverOrCreate_(project, project.originals, filename, image);
  var source = {
    sourceId: file.getId(), sha256: image.hash, nameJson: JSON.stringify(image.name), mimeType: image.mimeType,
    byteLength: image.bytes.length, kind: "participant", eligible: false, createdAt: now_(), modifiedAt: file.getLastUpdated().toISOString()
  };
  writeRecord_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders, source);
  return source;
}

// A contribution keeps the same file ID and bytes. The source-row ordinal is
// stable across retries and avoids a second counter or a duplicate Drive write.
function shareParticipantOriginal_(project, source) {
  readSource_(source);
  var file = ArchiveDrive.getFileById(source.sourceId);
  var filename = "participant_photo_" + (source._row - 1) + "." + extension_(source.mimeType);
  // Persist the participant role before moving. Folder discovery can then never
  // mistake this managed original for an artist photo if a later write fails.
  file.markParticipantPhoto(filename);
  file.moveTo(ArchiveDrive.getFolderById(project.artist.getId()));
  source.nameJson = JSON.stringify(filename);
  source.modifiedAt = file.getLastUpdated().toISOString();
  source.eligible = true;
  writeRecord_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders, source);
}

function rejectArchivedResult_(project, image) {
  var completed = readRecords_(project.submissions, EXPOSURE_CONFIG_.submissionsHeaders).some(function (submission) {
    return submission.resultSha256 === image.hash;
  });
  var savedResult = project.results.getFilesByName("result-" + image.hash + ".jpg");
  if (completed || savedResult.hasNext()) {
    throw apiError_("ALREADY_ARCHIVED_RESULT", "This file is already archived as a finished exposure. Choose an original photograph instead; no additional copy was saved.");
  }
}

function saveResult_(project, image) {
  var submissions = readRecords_(project.submissions, EXPOSURE_CONFIG_.submissionsHeaders);
  var matching = submissions.filter(function (submission) { return submission.resultSha256 === image.hash; });
  var saved = matching.filter(function (submission) { return submission.resultId; });
  if (saved.length) {
    for (var index = 0; index < saved.length; index++) {
      try {
        var file = ArchiveDrive.getFileById(saved[index].resultId);
        verifyImageFile_(file, image);
        return file;
      } catch (error) { /* Verify another recorded reference, never make a copy. */ }
    }
    throw apiError_("ARCHIVE_UNAVAILABLE", "This finished exposure is already recorded but its saved copy could not be verified. Please retry.");
  }
  // Earlier versions included a submission ID in result filenames. Recover
  // those interrupted writes before adopting the new shared content filename.
  for (var legacyIndex = 0; legacyIndex < matching.length; legacyIndex++) {
    var legacyFiles = project.results.getFilesByName("result-" + matching[legacyIndex].submissionId + "-" + image.hash + ".jpg");
    if (legacyFiles.hasNext()) return verifyImageFile_(legacyFiles.next(), image);
  }
  // Hash-only names recover a Drive write even if it preceded a failed index
  // update or belongs to another submission producing exactly the same JPEG.
  return recoverOrCreate_(project, project.results, "result-" + image.hash + ".jpg", image);
}

function verifyImageFile_(file, image) {
  var bytes = file.getBlob().getBytes();
  if (bytes.length !== image.bytes.length || sha256_(bytes) !== image.hash || detectMime_(bytes) !== image.mimeType) {
    throw apiError_("STORAGE_CONFLICT", "An archive file could not be verified. Please contact the artist.");
  }
  return file;
}

function recoverOrCreate_(project, folder, filename, image) {
  var files = folder.getFilesByName(filename);
  if (files.hasNext()) {
    var file = files.next();
    return verifyImageFile_(file, image);
  }
  // Reserve before Drive writes. A retry reuses this key, including when the
  // previous attempt stopped after reservation or after creating the file.
  reserveUsage_(project, "file:" + folder.getId() + ":" + filename, "file", image.bytes.length);
  return folder.createFile(Utilities.newBlob(image.bytes, image.mimeType, filename));
}

function readSource_(source) {
  try {
    var file = source.kind === "artist"
      ? ArchiveDrive.getArtistFileById(source.sourceId, PropertiesService.getScriptProperties().getProperty("EXPOSURE_ARTIST_FOLDER_ID"))
      : ArchiveDrive.getFileById(source.sourceId);
    if (file.getSize() > EXPOSURE_CONFIG_.maxOriginalBytes) throw new Error("Too large");
    var bytes = file.getBlob().getBytes();
    if (bytes.length > EXPOSURE_CONFIG_.maxOriginalBytes || sha256_(bytes) !== source.sha256 || detectMime_(bytes) !== source.mimeType) throw new Error("Changed source");
    return { id: source.sourceId, name: JSON.parse(source.nameJson), mimeType: source.mimeType, base64: Utilities.base64Encode(bytes) };
  } catch (error) {
    throw apiError_("BASE_UNAVAILABLE", "The assigned photograph is unavailable. Please contact the artist.");
  }
}

function eligibleSources_(project, excludedHash, includeParticipants, excludedBaseHash) {
  var candidates = readRecords_(project.sources, EXPOSURE_CONFIG_.sourcesHeaders).filter(function (source) {
    return isEligible_(source) && source.sha256 !== excludedHash && source.sha256 !== excludedBaseHash &&
      (source.kind === "artist" || (includeParticipants && source.kind === "participant"));
  });
  // Archive roles remain separate, but byte-identical photographs get one
  // chance in the lottery. Prefer the artist's source when both roles exist.
  var ordered = candidates.filter(function (source) { return source.kind === "artist"; })
    .concat(candidates.filter(function (source) { return source.kind === "participant"; }));
  var seen = {};
  return ordered.filter(function (source) {
    if (seen[source.sha256]) return false;
    seen[source.sha256] = true;
    return true;
  });
}

function imageInput_(input, limit, resultOnly) {
  if (!isObject_(input) || typeof input.name !== "string" || typeof input.mimeType !== "string" || typeof input.base64 !== "string") {
    throw apiError_("INVALID_IMAGE", "The photograph could not be read. Please choose it again.");
  }
  var encoded = input.base64;
  if (!encoded.length || encoded.length > Math.ceil(limit / 3) * 4 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw apiError_("INVALID_IMAGE", "The photograph is invalid or exceeds the archive size limit.");
  }
  var bytes;
  try { bytes = Utilities.base64Decode(encoded); }
  catch (error) { throw apiError_("INVALID_IMAGE", "The photograph could not be decoded."); }
  if (!bytes.length || bytes.length > limit) throw apiError_("IMAGE_TOO_LARGE", "The photograph exceeds the archive size limit.");
  var mimeType = detectMime_(bytes);
  if (!mimeType || input.mimeType.toLowerCase() !== mimeType || (resultOnly && mimeType !== "image/jpeg")) {
    throw apiError_("UNSUPPORTED_IMAGE", resultOnly ? "The finished exposure must be a JPEG." : "Choose a JPEG, PNG, WebP, or AVIF photograph.");
  }
  return { name: cleanName_(input.name), mimeType: mimeType, bytes: bytes, hash: sha256_(bytes) };
}

function detectMime_(bytes) {
  var length = bytes.length;
  var byte = function (index) { return bytes[index] & 255; };
  var text = function (offset, count) {
    var value = "";
    for (var i = offset; i < offset + count && i < length; i++) value += String.fromCharCode(byte(i));
    return value;
  };
  if (length >= 3 && byte(0) === 255 && byte(1) === 216 && byte(2) === 255) return "image/jpeg";
  if (length >= 8 && byte(0) === 137 && text(1, 3) === "PNG" && byte(4) === 13 && byte(5) === 10 && byte(6) === 26 && byte(7) === 10) return "image/png";
  if (length >= 12 && text(0, 4) === "RIFF" && text(8, 4) === "WEBP") return "image/webp";
  if (length >= 16 && text(4, 4) === "ftyp") {
    var boxSize = byte(0) * 16777216 + byte(1) * 65536 + byte(2) * 256 + byte(3);
    if (boxSize >= 16 && boxSize <= length) {
      if (/^avi[fs]$/.test(text(8, 4))) return "image/avif";
      for (var offset = 16; offset + 4 <= boxSize; offset += 4) {
        if (/^avi[fs]$/.test(text(offset, 4))) return "image/avif";
      }
    }
  }
  return "";
}

function dimensions_(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 10000 || height > 10000 || width * height > 80000000) {
    throw apiError_("INVALID_DIMENSIONS", "The finished exposure dimensions are invalid.");
  }
  return { width: width, height: height };
}

function settings_(value) {
  if (!isObject_(value) || typeof value.baseExposure !== "number" || !Number.isFinite(value.baseExposure) || value.baseExposure < -3 || value.baseExposure > 1 || typeof value.participantExposure !== "number" || !Number.isFinite(value.participantExposure) || value.participantExposure < -3 || value.participantExposure > 1 || typeof value.contrast !== "number" || !Number.isFinite(value.contrast) || value.contrast < -30 || value.contrast > 30 || typeof value.monochrome !== "boolean") {
    throw apiError_("INVALID_SETTINGS", "The exposure settings are invalid.");
  }
  return { baseExposure: value.baseExposure, participantExposure: value.participantExposure, contrast: value.contrast, monochrome: value.monochrome };
}

function project_() {
  requireProjectOwner_();
  var properties = PropertiesService.getScriptProperties();
  var ids = ["EXPOSURE_ARTIST_FOLDER_ID", "EXPOSURE_ORIGINALS_FOLDER_ID", "EXPOSURE_RESULTS_FOLDER_ID", "EXPOSURE_SPREADSHEET_ID"].map(function (key) { return properties.getProperty(key); });
  if (ids.some(function (id) { return !id; })) throw apiError_("NOT_CONFIGURED", "The artist has not connected the archive yet.");
  var spreadsheet = ArchiveSheets.openById(ids[3]);
  var sources = spreadsheet.getSheetByName("Sources");
  var submissions = spreadsheet.getSheetByName("Submissions");
  if (!sources || !submissions) throw apiError_("NOT_CONFIGURED", "The archive index has not been set up yet.");
  ensureSourceHeaders_(sources);
  ensureSubmissionHeaders_(submissions);
  // Add the ledger when an older deployment first opens its existing index.
  var usage = setupSheet_(spreadsheet, "Usage", EXPOSURE_CONFIG_.usageHeaders);
  var project = { artist: ArchiveDrive.getArtistFolderById(ids[0]), originals: ArchiveDrive.getFolderById(ids[1]), results: ArchiveDrive.getFolderById(ids[2]), sources: sources, submissions: submissions, usage: usage };
  // Pin old assignments before a refresh can replace an artist source hash,
  // including requests that skip the scan because its freshness window is open.
  pinLegacyBases_(project, readRecords_(sources, EXPOSURE_CONFIG_.sourcesHeaders));
  return project;
}

function archiveLimits_() {
  var properties = PropertiesService.getScriptProperties();
  function positive(key, fallback) {
    var raw = properties.getProperty(key);
    if (raw === null) return fallback;
    var value = Number(raw);
    if (!/^\d+$/.test(String(raw).trim()) || !Number.isSafeInteger(value) || value < 1) {
      throw apiError_("LIMIT_CONFIGURATION", "The archive limits need the artist's attention.");
    }
    return value;
  }
  var paused = properties.getProperty("UPLOADS_PAUSED");
  if (paused !== null && ["true", "false"].indexOf(String(paused).trim().toLowerCase()) < 0) {
    throw apiError_("LIMIT_CONFIGURATION", "The archive limits need the artist's attention.");
  }
  return { paused: String(paused).trim().toLowerCase() === "true",
    requests: positive("REQUESTS_PER_MINUTE", 120),
    submissions: positive("SUBMISSIONS_PER_DAY", 200),
    bytes: positive("UPLOAD_BYTES_PER_DAY", 1024 * 1024 * 1024) };
}

// Called under the script lock before reading or decoding visitor data. The
// fixed UTC minute is a global budget, not a per-person or per-IP rate limit.
function guardVisitorRequest_() {
  var limits = archiveLimits_();
  if (limits.paused) throw apiError_("UPLOADS_PAUSED", "The artist has temporarily paused uploads. Please try again later.");
  var properties = PropertiesService.getScriptProperties();
  var minute = Math.floor(Date.now() / 60000);
  var raw = properties.getProperty("EXPOSURE_REQUEST_WINDOW");
  var state = { minute: minute, count: 0 };
  if (raw !== null) {
    try { state = JSON.parse(raw); } catch (error) { state = null; }
    if (!isObject_(state) || !Number.isSafeInteger(state.minute) || state.minute < 0 || state.minute > minute ||
        !Number.isSafeInteger(state.count) || state.count < 0) {
      throw apiError_("LIMIT_CONFIGURATION", "The archive limits need the artist's attention.");
    }
    if (state.minute < minute) state = { minute: minute, count: 0 };
  }
  if (state.count >= limits.requests) throw apiError_("RATE_LIMITED", "The archive is receiving too many requests. Please retry in a minute.");
  state.count++;
  properties.setProperty("EXPOSURE_REQUEST_WINDOW", JSON.stringify(state));
}

function reserveUsage_(project, key, kind, bytes) {
  var records = readRecords_(project.usage, EXPOSURE_CONFIG_.usageHeaders);
  var today = now_().slice(0, 10);
  var usedBytes = 0;
  var usedSubmissions = 0;
  var existing = null;
  var seen = {};
  records.forEach(function (record) {
    if (typeof record.key !== "string" || !record.key || seen[record.key] ||
        typeof record.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(record.day) || record.day > today ||
        !Number.isFinite(Date.parse(record.day)) || new Date(record.day).toISOString().slice(0, 10) !== record.day ||
        ["submission", "file"].indexOf(record.kind) < 0 || !Number.isSafeInteger(record.bytes) || record.bytes < 0 ||
        (record.kind === "submission" && record.bytes !== 0) || (record.kind === "file" && record.bytes < 1)) {
      throw apiError_("LIMIT_CONFIGURATION", "The archive usage records need the artist's attention.");
    }
    seen[record.key] = true;
    if (record.key === key) existing = record;
    if (record.day === today) {
      usedBytes += record.bytes;
      if (record.kind === "submission") usedSubmissions++;
    }
  });
  if (!Number.isSafeInteger(usedBytes)) throw apiError_("LIMIT_CONFIGURATION", "The archive usage records need the artist's attention.");
  if (existing) {
    if (existing.kind !== kind || existing.bytes !== bytes) throw apiError_("LIMIT_CONFIGURATION", "The archive usage records need the artist's attention.");
    if (existing.day === today) return;
  }
  var limits = archiveLimits_();
  if ((kind === "submission" && usedSubmissions >= limits.submissions) || bytes > limits.bytes - usedBytes) {
    throw apiError_("DAILY_LIMIT_REACHED", "Today's archive intake limit has been reached. Please try again tomorrow.");
  }
  // Keep ISO day labels as text instead of letting Sheets infer a local date.
  var reservation = existing || { key: key, kind: kind, bytes: bytes };
  // This helper runs only before a new submission/file write. A recovered
  // existing file bypasses it. Move an unused older reservation to today so
  // delayed attempts cannot spend several days' allowances in one day.
  reservation.day = today;
  project.usage.getRange(reservation._row || project.usage.getLastRow() + 1, 2).setNumberFormat("@");
  writeRecord_(project.usage, EXPOSURE_CONFIG_.usageHeaders, reservation);
  // Persist this reservation before a Drive write or a later index operation.
  ArchiveSheets.flush();
}

function setupFolder_(root, properties, key, name) {
  var id = properties.getProperty(key);
  if (id) return ArchiveDrive.getFolderById(id);
  var folders = root.getFoldersByName(name);
  var folder = folders.hasNext() ? folders.next() : root.createFolder(name);
  properties.setProperty(key, folder.getId());
  return folder;
}

function setupSheet_(spreadsheet, name, headers) {
  var sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (name === "Submissions") ensureSubmissionHeaders_(sheet);
  else if (name === "Sources") ensureSourceHeaders_(sheet);
  else validateHeaders_(sheet, headers);
  return sheet;
}

function ensureSubmissionHeaders_(sheet) {
  var headers = EXPOSURE_CONFIG_.submissionsHeaders;
  validateHeaders_(sheet, headers.slice(0, 13));
  var extra = sheet.getRange(1, 14, 1, 2).getValues()[0];
  if (extra[0] === "" && extra[1] === "") sheet.getRange(1, 14, 1, 2).setValues([headers.slice(13, 15)]);
  if (sheet.getRange(1, 16).getValues()[0][0] === "") sheet.getRange(1, 16).setValues([[headers[15]]]);
  validateHeaders_(sheet, headers);
}

function ensureSourceHeaders_(sheet) {
  var headers = EXPOSURE_CONFIG_.sourcesHeaders;
  validateHeaders_(sheet, headers.slice(0, 8));
  if (sheet.getRange(1, 9).getValues()[0][0] === "") sheet.getRange(1, 9).setValues([[headers[8]]]);
  validateHeaders_(sheet, headers);
}

function validateHeaders_(sheet, headers) {
  var actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (headers.some(function (header, index) { return actual[index] !== header; })) {
    throw apiError_("INDEX_SCHEMA", "The archive index needs the artist's attention.");
  }
}

function readRecords_(sheet, headers) {
  var count = sheet.getLastRow() - 1;
  if (count < 1) return [];
  return sheet.getRange(2, 1, count, headers.length).getValues().map(function (values, index) {
    var record = { _row: index + 2 };
    headers.forEach(function (header, column) { record[header] = values[column]; });
    return record;
  });
}

function writeRecord_(sheet, headers, record) {
  var row = record._row || sheet.getLastRow() + 1;
  var values = headers.map(function (header) { return record[header] === undefined ? "" : record[header]; });
  sheet.getRange(row, 1, 1, headers.length).setValues([values]);
  record._row = row;
}

// Scans may change many rows. Keep one coherent index write, preserving all
// existing records, rather than spending a Google Sheets write per photograph.
function writeRecordUpdates_(sheet, headers, existing, updates) {
  if (!updates.length) return;
  var records = existing.slice();
  updates.forEach(function (record) {
    var index = record._row ? record._row - 2 : records.length;
    records[index] = record;
    record._row = index + 2;
  });
  var values = records.map(function (record) {
    return headers.map(function (header) { return record[header] === undefined ? "" : record[header]; });
  });
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

function findRecord_(records, key, value) {
  for (var index = 0; index < records.length; index++) if (records[index][key] === value) return records[index];
  return null;
}

function withLock_(callback) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw apiError_("BUSY", "The archive is busy. Please retry in a moment.");
  try {
    ArchiveDrive.reset();
    ArchiveSheets.reset();
    return callback();
  }
  finally {
    // Commit buffered Sheet writes before another request acquires the lock.
    try { ArchiveSheets.flush(); }
    finally { lock.releaseLock(); }
  }
}

function siteConfig_() {
  var properties = PropertiesService.getScriptProperties();
  var siteUrl = String(properties.getProperty("SITE_URL") || "").trim();
  var match = /^(https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?)(\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]*)?$/.exec(siteUrl);
  if (!match) throw apiError_("NOT_CONFIGURED", "The archive website address has not been configured.");
  var origins = [match[1]];
  String(properties.getProperty("ALLOWED_ORIGINS") || "").split(",").forEach(function (entry) {
    var origin = entry.trim();
    if (!origin) return;
    var validHttps = /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(origin);
    var validLocal = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/.test(origin);
    if (!validHttps && !validLocal) throw apiError_("NOT_CONFIGURED", "An additional website origin is invalid.");
    if (origins.indexOf(origin) < 0) origins.push(origin);
  });
  return { siteUrl: siteUrl.replace(/\/+$/, "") + "/", origins: origins };
}

function includeParticipants_() {
  return String(PropertiesService.getScriptProperties().getProperty("INCLUDE_PARTICIPANT_PHOTOS") || "").toLowerCase().trim() !== "false";
}

function submissionId_(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw apiError_("INVALID_SUBMISSION", "The submission identifier is invalid. Start a new submission.");
  }
  return value.toLowerCase();
}

function sha256_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function (byte) {
    return ("0" + (byte & 255).toString(16)).slice(-2);
  }).join("");
}

function newToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ""); }
function tokenMatches_(expected, supplied) {
  if (typeof supplied !== "string" || typeof expected !== "string" || supplied.length !== expected.length || !expected.length) return false;
  var difference = 0;
  for (var index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  return difference === 0;
}
function cleanName_(value) { return String(value).replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 200).trim() || "Photograph"; }
function extension_(mimeType) { return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" }[mimeType]; }
function isEligible_(source) { return source.eligible === true || source.eligible === "true"; }
function isObject_(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function now_() { return new Date().toISOString(); }
function escapeHtml_(value) { return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function apiError_(code, message, originalSaved) {
  var error = new Error(message);
  error.exposureCode_ = code;
  if (originalSaved) error.originalSaved_ = true;
  return error;
}
