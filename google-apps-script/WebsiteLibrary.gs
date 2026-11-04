var WEBSITE_LIBRARY_CACHE_ = {
  key: "line-break-website-library-v1",
  maxBytes: 1024 * 1024,
  partLength: 80000,
  freshMs: 60000,
  retrySeconds: 15,
  retainSeconds: 600
};

function loadWebsiteArtistIndex_(preferredHash) {
  var url = siteConfig_().siteUrl + "assets/base-photos.json";
  var cache;
  try { cache = CacheService.getScriptCache(); }
  catch (error) { /* The live manifest also works without a cache. */ }
  var cached = readWebsiteLibraryCache_(cache, url);
  var now = Date.now();
  if (cached && now - cached.checkedAt < WEBSITE_LIBRARY_CACHE_.freshMs &&
      (!/^[0-9a-f]{64}$/.test(preferredHash || "") || cached.index[preferredHash])) {
    return cached.index;
  }
  if (claimWebsiteLibraryRefresh_(cache, url)) {
    try {
      var index = fetchWebsiteArtistIndex_(url);
      writeWebsiteLibraryCache_(cache, url, now, index);
      return index;
    } catch (error) {
      if (!cached) throw error;
    }
  }
  if (!cached) cached = readWebsiteLibraryCache_(cache, url);
  if (cached) return cached.index;
  throw apiError_("ARCHIVE_UNAVAILABLE", "The website photo library is temporarily unavailable. Please retry.");
}

function fetchWebsiteArtistIndex_(url) {
  var response;
  try {
    response = UrlFetchApp.fetch(url, {
      followRedirects: false, muteHttpExceptions: true, headers: { "Cache-Control": "no-cache" }
    });
  } catch (error) {
    throw apiError_("ARCHIVE_UNAVAILABLE", "The website photo library is temporarily unavailable. Please retry.");
  }
  if (response.getResponseCode() !== 200) {
    throw apiError_("ARCHIVE_UNAVAILABLE", "The website photo library is temporarily unavailable. Please retry.");
  }
  var bytes = response.getContent(), catalog;
  if (!bytes.length || bytes.length > WEBSITE_LIBRARY_CACHE_.maxBytes) {
    throw apiError_("ASSET_CONFIGURATION", "The website photo library needs attention.");
  }
  try { catalog = JSON.parse(Utilities.newBlob(bytes).getDataAsString("UTF-8")); }
  catch (error) { throw apiError_("ASSET_CONFIGURATION", "The website photo library needs attention."); }
  return artistAssetIndex_(catalog);
}

function readWebsiteLibraryCache_(cache, url) {
  if (!cache) return null;
  var config = WEBSITE_LIBRARY_CACHE_;
  try {
    var entry = JSON.parse(cache.get(config.key));
    var now = Date.now();
    if (!entry || entry.url !== url ||
        !Number.isSafeInteger(entry.checkedAt) || entry.checkedAt > now ||
        now - entry.checkedAt >= config.retainSeconds * 1000) return null;
    var encoded = entry.encoded;
    if (typeof encoded !== "string") {
      var maxParts = Math.ceil(Math.ceil(config.maxBytes / 3) * 4 / config.partLength);
      if (typeof entry.generation !== "string" || !Number.isSafeInteger(entry.count) ||
          entry.count < 2 || entry.count > maxParts) return null;
      var keys = Array.from({ length: entry.count }, function (_, index) {
        return config.key + ":" + entry.generation + ":" + index;
      });
      var parts = cache.getAll(keys);
      if (!keys.every(function (key) { return typeof parts[key] === "string" && parts[key].length <= config.partLength; })) return null;
      encoded = keys.map(function (key) { return parts[key]; }).join("");
    }
    var bytes = Utilities.base64Decode(encoded);
    if (!bytes.length || bytes.length > config.maxBytes) return null;
    var catalog = JSON.parse(Utilities.newBlob(bytes).getDataAsString("UTF-8"));
    return { checkedAt: entry.checkedAt, index: artistAssetIndex_(catalog) };
  } catch (error) {
    return null;
  }
}

function claimWebsiteLibraryRefresh_(cache, url) {
  if (!cache) return true;
  var config = WEBSITE_LIBRARY_CACHE_, key = config.key + ":refresh";
  try {
    // Claim a short retry interval without holding the archive lock across HTTP.
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(100)) return false;
    try {
      if (cache.get(key) === url) return false;
      cache.put(key, url, config.retrySeconds);
      return true;
    } finally { lock.releaseLock(); }
  } catch (error) {
    return true;
  }
}

function writeWebsiteLibraryCache_(cache, url, checkedAt, index) {
  if (!cache) return;
  var config = WEBSITE_LIBRARY_CACHE_;
  try {
    var catalog = { version: 1, photos: Object.keys(index).map(function (hash) { return index[hash]; }) };
    var bytes = Utilities.newBlob(JSON.stringify(catalog)).getBytes();
    if (bytes.length > config.maxBytes) return;
    var encoded = Utilities.base64Encode(bytes);
    var entry = { url: url, checkedAt: checkedAt };
    if (encoded.length <= config.partLength) {
      entry.encoded = encoded;
    } else {
      entry.generation = Utilities.getUuid();
      entry.count = 0;
      var parts = {};
      // CacheService limits each entry to 100 KB. Publish the pointer last.
      for (var offset = 0; offset < encoded.length; offset += config.partLength) {
        parts[config.key + ":" + entry.generation + ":" + entry.count++] = encoded.slice(offset, offset + config.partLength);
      }
      cache.putAll(parts, config.retainSeconds);
    }
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(100)) return;
    try {
      var current;
      try { current = JSON.parse(cache.get(config.key)); }
      catch (error) { /* Replace invalid metadata with the validated snapshot. */ }
      if (current && current.url === url && current.checkedAt > checkedAt) return;
      cache.put(config.key, JSON.stringify(entry), config.retainSeconds);
    } finally { lock.releaseLock(); }
  } catch (error) { /* A missed cache write cannot invalidate a live response. */ }
}
