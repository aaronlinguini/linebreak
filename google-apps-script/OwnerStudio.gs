function studioPage_(siteUrl) {
  requireOwner_();
  requireProjectOwner_();
  var html = HtmlService.createHtmlOutputFromFile("Studio").getContent();
  html = html.split("__STUDIO_ASSET_ROOT__").join(escapeHtml_(siteUrl));
  return HtmlService.createHtmlOutput(html).setTitle("Double exposure · local test");
}

function studioApi(request) {
  try {
    requireOwner_();
    requireProjectOwner_();
    if (!isObject_(request) || Object.keys(request).some(function (key) { return ["action", "payload"].indexOf(key) < 0; }) ||
        ["status", "save"].indexOf(request.action) < 0) {
      throw apiError_("INVALID_REQUEST", "Choose a valid personal archive operation.");
    }
    var payload = request.payload === undefined ? {} : request.payload;
    if (!isObject_(payload)) throw apiError_("INVALID_REQUEST", "The personal archive request is invalid.");
    var image, dimensions;
    if (request.action === "status") {
      if (Object.keys(payload).length) throw apiError_("INVALID_REQUEST", "The personal archive request is invalid.");
    } else {
      if (Object.keys(payload).some(function (key) { return ["image", "width", "height"].indexOf(key) < 0; }) ||
          !isObject_(payload.image) || Object.keys(payload.image).some(function (key) { return ["name", "mimeType", "base64"].indexOf(key) < 0; }) ||
          typeof payload.image.name === "string" && /[\\/]/.test(payload.image.name)) {
        throw apiError_("INVALID_REQUEST", "The personal archive request is invalid.");
      }
      image = imageInput_(payload.image, EXPOSURE_CONFIG_.maxResultBytes, true);
      dimensions = dimensions_(payload.width, payload.height);
    }
    var data = withLock_(function () {
      var folder = studioFolder_();
      if (request.action === "status") return { folderUrl: folder.getUrl(), maxResultBytes: EXPOSURE_CONFIG_.maxResultBytes };
      return saveStudioResult_(folder, image, dimensions);
    });
    return { ok: true, data: data };
  } catch (error) {
    return { ok: false, error: {
      code: error && error.exposureCode_ ? error.exposureCode_ : "ARCHIVE_UNAVAILABLE",
      message: error && error.exposureCode_ ? error.message : "The personal save could not be confirmed. Please retry."
    } };
  }
}

function studioFolder_() {
  var properties = PropertiesService.getScriptProperties();
  var rootId = properties.getProperty("EXPOSURE_ROOT_FOLDER_ID");
  if (!rootId) throw apiError_("NOT_CONFIGURED", "The personal archive is not connected.");
  var key = "EXPOSURE_OWNER_RESULTS_FOLDER_ID";
  var existingId = properties.getProperty(key);
  var reservedIds = [rootId, properties.getProperty("EXPOSURE_ARTIST_FOLDER_ID"),
    properties.getProperty("EXPOSURE_ORIGINALS_FOLDER_ID"), properties.getProperty("EXPOSURE_RESULTS_FOLDER_ID")];
  if (existingId && reservedIds.indexOf(existingId) >= 0) {
    throw apiError_("STUDIO_CONFIGURATION", "The personal archive folder needs attention.");
  }
  return setupFolder_(ArchiveDrive.getFolderById(rootId), properties, key, "Personal_double_exposures");
}

function saveStudioResult_(folder, image, dimensions) {
  var filename = "personal-result-" + image.hash + ".jpg";
  var files = folder.getFilesByName(filename);
  var duplicate = files.hasNext();
  var file = duplicate ? files.next() : folder.createFile(Utilities.newBlob(image.bytes, image.mimeType, filename));
  verifyImageFile_(file, image);
  return {
    saved: true, duplicate: duplicate, sha256: image.hash, byteLength: image.bytes.length,
    width: dimensions.width, height: dimensions.height, fileUrl: file.getUrl(), folderUrl: folder.getUrl()
  };
}
