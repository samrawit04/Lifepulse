using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Controllers;

public record PinterestPinDto(
    string Id,
    string? Title,
    string? Description,
    string ImageUrl,
    string ThumbnailUrl,
    int Width,
    int Height,
    string? PinnerName,
    string? PinnerAvatar,
    string PinUrl,
    string? DominantColor,
    string? BoardName,
    string? SourceDomain
);

/// <param name="Source">Where the images came from: pinterest, pexels, unsplash, openverse or none.</param>
public record PinterestSearchResponse(
    List<PinterestPinDto> Pins,
    string? Bookmark,
    bool HasMore,
    string Source = "pinterest"
);

/// <summary>
/// Image inspiration search. Pinterest has no public search API, so we try its web
/// endpoints first. When Pinterest blocks the server (common on cloud hosts), we fall
/// back to Pexels or Unsplash (if an API key is configured) and finally to Openverse,
/// which needs no key, so the page always shows something.
/// </summary>
[ApiController]
[Authorize]
[Route("api/pinterest")]
public class PinterestController(IHttpClientFactory httpClientFactory, IConfiguration config, ILogger<PinterestController> logger) : ControllerBase
{
    private const string UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    private readonly HttpClient _client = httpClientFactory.CreateClient();
    private readonly HttpClient _pinterest = httpClientFactory.CreateClient("pinterest");

    // Pinterest session cookies, reused for a while so we don't handshake on every search
    private static string? _cookieHeader;
    private static string? _csrfToken;
    private static DateTime _cookiesFetchedAt = DateTime.MinValue;
    private static readonly SemaphoreSlim CookieLock = new(1, 1);

    // ── GET /api/pinterest/search ─────────────────────────────────────────────
    [HttpGet("search")]
    public async Task<ActionResult<PinterestSearchResponse>> Search([FromQuery] string q, [FromQuery] string? bookmark = null)
    {
        if (string.IsNullOrWhiteSpace(q))
            return Ok(new PinterestSearchResponse([], null, false, "none"));

        var query = q.Trim();
        if (query.Length > 120) query = query[..120];

        // "Load more" for a fallback source carries its provider in the bookmark, e.g. "pexels:2"
        var (provider, page) = ParseFallbackBookmark(bookmark);
        if (provider != null)
            return Ok(await SearchFallback(query, provider, page) ?? new PinterestSearchResponse([], null, false, "none"));

        var fromPinterest = await SearchPinterest(query, bookmark);
        if (fromPinterest is { Pins.Count: > 0 }) return Ok(fromPinterest);

        foreach (var p in new[] { "pexels", "unsplash", "openverse" })
        {
            var res = await SearchFallback(query, p, 1);
            if (res is { Pins.Count: > 0 }) return Ok(res);
        }
        return Ok(new PinterestSearchResponse([], null, false, "none"));
    }

    // ── Pinterest ─────────────────────────────────────────────────────────────

    private async Task<PinterestSearchResponse?> SearchPinterest(string query, string? bookmark)
    {
        try
        {
            await EnsurePinterestSession();

            var sourceUrl = $"/search/pins/?q={Uri.EscapeDataString(query)}&rs=typed";
            var options = new Dictionary<string, object?>
            {
                ["query"] = query,
                ["scope"] = "pins",
                ["rs"] = "typed",
                ["page_size"] = 25,
                ["redux_normalize_feed"] = true,
                ["source_url"] = sourceUrl,
            };
            if (!string.IsNullOrEmpty(bookmark)) options["bookmarks"] = new[] { bookmark };

            var data = JsonSerializer.Serialize(new { options, context = new { } });
            var endpoint = "https://www.pinterest.com/resource/BaseSearchResource/get/" +
                           $"?source_url={Uri.EscapeDataString(sourceUrl)}&data={Uri.EscapeDataString(data)}&_={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";

            var req = new HttpRequestMessage(HttpMethod.Get, endpoint);
            AddBrowserHeaders(req, json: true);
            req.Headers.Add("X-Pinterest-PWS-Handler", "www/search/[scope].js");
            req.Headers.Add("X-Pinterest-Source-Url", sourceUrl);
            if (_csrfToken != null) req.Headers.Add("X-CSRFToken", _csrfToken);
            if (_cookieHeader != null) req.Headers.Add("Cookie", _cookieHeader);

            var res = await _pinterest.SendAsync(req);
            if (res.IsSuccessStatusCode)
            {
                var pins = ParsePinterestJson(await res.Content.ReadAsStringAsync(), out var nextBookmark);
                if (pins.Count > 0)
                    return new PinterestSearchResponse(pins, nextBookmark, !string.IsNullOrEmpty(nextBookmark) && nextBookmark != "-end-", "pinterest");
            }
            else
            {
                logger.LogInformation("Pinterest search returned {Status}", (int)res.StatusCode);
                if ((int)res.StatusCode is 401 or 403) _cookiesFetchedAt = DateTime.MinValue; // refresh session next time
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Pinterest API attempt failed for query: {Query}", query);
        }

        // HTML fallback (first page only)
        if (!string.IsNullOrEmpty(bookmark)) return null;
        try
        {
            var htmlReq = new HttpRequestMessage(HttpMethod.Get, $"https://www.pinterest.com/search/pins/?q={Uri.EscapeDataString(query)}");
            AddBrowserHeaders(htmlReq, json: false);
            if (_cookieHeader != null) htmlReq.Headers.Add("Cookie", _cookieHeader);
            var htmlRes = await _pinterest.SendAsync(htmlReq);
            if (htmlRes.IsSuccessStatusCode)
            {
                var pins = ExtractPinsFromHtml(await htmlRes.Content.ReadAsStringAsync());
                if (pins.Count > 0) return new PinterestSearchResponse(pins, null, false, "pinterest");
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Pinterest HTML scrape failed for query: {Query}", query);
        }
        return null;
    }

    /// <summary>Visit the home page once to get the csrftoken/session cookies Pinterest expects.</summary>
    private async Task EnsurePinterestSession()
    {
        if (_cookieHeader != null && DateTime.UtcNow - _cookiesFetchedAt < TimeSpan.FromMinutes(30)) return;
        await CookieLock.WaitAsync();
        try
        {
            if (_cookieHeader != null && DateTime.UtcNow - _cookiesFetchedAt < TimeSpan.FromMinutes(30)) return;
            var req = new HttpRequestMessage(HttpMethod.Get, "https://www.pinterest.com/");
            AddBrowserHeaders(req, json: false);
            var res = await _pinterest.SendAsync(req);
            if (!res.Headers.TryGetValues("Set-Cookie", out var setCookies)) return;

            var pairs = new Dictionary<string, string>();
            foreach (var c in setCookies)
            {
                var first = c.Split(';', 2)[0];
                var eq = first.IndexOf('=');
                if (eq > 0) pairs[first[..eq].Trim()] = first[(eq + 1)..].Trim();
            }
            if (pairs.Count == 0) return;
            _cookieHeader = string.Join("; ", pairs.Select(kv => $"{kv.Key}={kv.Value}"));
            _csrfToken = pairs.GetValueOrDefault("csrftoken");
            _cookiesFetchedAt = DateTime.UtcNow;
        }
        catch (Exception ex)
        {
            logger.LogInformation(ex, "Couldn't open a Pinterest session");
        }
        finally
        {
            CookieLock.Release();
        }
    }

    private static void AddBrowserHeaders(HttpRequestMessage req, bool json)
    {
        req.Headers.TryAddWithoutValidation("User-Agent", UserAgent);
        req.Headers.TryAddWithoutValidation("Accept-Language", "en-US,en;q=0.9");
        req.Headers.TryAddWithoutValidation("Referer", "https://www.pinterest.com/");
        if (json)
        {
            req.Headers.TryAddWithoutValidation("Accept", "application/json, text/javascript, */*; q=0.01");
            req.Headers.TryAddWithoutValidation("X-Requested-With", "XMLHttpRequest");
            req.Headers.TryAddWithoutValidation("X-APP-VERSION", "web");
        }
        else
        {
            req.Headers.TryAddWithoutValidation("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
        }
    }

    // ── Fallback sources ──────────────────────────────────────────────────────

    private static (string? provider, int page) ParseFallbackBookmark(string? bookmark)
    {
        if (string.IsNullOrEmpty(bookmark)) return (null, 1);
        var parts = bookmark.Split(':', 2);
        if (parts.Length == 2 && parts[0] is "pexels" or "unsplash" or "openverse" && int.TryParse(parts[1], out var page))
            return (parts[0], Math.Clamp(page, 1, 50));
        return (null, 1);
    }

    private string? Key(string configKey, string envKey) =>
        config[configKey] is { Length: > 0 } v ? v : Environment.GetEnvironmentVariable(envKey) is { Length: > 0 } e ? e : null;

    private async Task<PinterestSearchResponse?> SearchFallback(string query, string provider, int page)
    {
        try
        {
            return provider switch
            {
                "pexels" => await SearchPexels(query, page),
                "unsplash" => await SearchUnsplash(query, page),
                "openverse" => await SearchOpenverse(query, page),
                _ => null,
            };
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "{Provider} image search failed", provider);
            return null;
        }
    }

    private async Task<PinterestSearchResponse?> SearchPexels(string query, int page)
    {
        var key = Key("Pexels:ApiKey", "PEXELS_API_KEY");
        if (key == null) return null;
        var req = new HttpRequestMessage(HttpMethod.Get, $"https://api.pexels.com/v1/search?query={Uri.EscapeDataString(query)}&per_page=30&page={page}");
        req.Headers.TryAddWithoutValidation("Authorization", key);
        var res = await _client.SendAsync(req);
        if (!res.IsSuccessStatusCode) return null;
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var list = new List<PinterestPinDto>();
        foreach (var p in doc.RootElement.GetProperty("photos").EnumerateArray())
        {
            var src = p.GetProperty("src");
            list.Add(new PinterestPinDto(
                $"pexels_{p.GetProperty("id").GetRawText()}",
                Str(p, "alt"), null,
                Str(src, "large2x") ?? Str(src, "large") ?? "",
                Str(src, "medium") ?? Str(src, "large") ?? "",
                Int(p, "width", 800), Int(p, "height", 1200),
                Str(p, "photographer"), null,
                Str(p, "url") ?? "https://www.pexels.com/",
                Str(p, "avg_color"), null, "pexels.com"));
        }
        var hasMore = doc.RootElement.TryGetProperty("next_page", out var np) && np.ValueKind == JsonValueKind.String;
        return new PinterestSearchResponse(list, hasMore ? $"pexels:{page + 1}" : null, hasMore, "pexels");
    }

    private async Task<PinterestSearchResponse?> SearchUnsplash(string query, int page)
    {
        var key = Key("Unsplash:AccessKey", "UNSPLASH_ACCESS_KEY");
        if (key == null) return null;
        var res = await _client.GetAsync($"https://api.unsplash.com/search/photos?query={Uri.EscapeDataString(query)}&per_page=30&page={page}&client_id={Uri.EscapeDataString(key)}");
        if (!res.IsSuccessStatusCode) return null;
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var list = new List<PinterestPinDto>();
        foreach (var p in doc.RootElement.GetProperty("results").EnumerateArray())
        {
            var urls = p.GetProperty("urls");
            var user = p.TryGetProperty("user", out var u) ? u : default;
            string? avatar = null;
            if (user.ValueKind == JsonValueKind.Object && user.TryGetProperty("profile_image", out var pi)) avatar = Str(pi, "small");
            list.Add(new PinterestPinDto(
                $"unsplash_{Str(p, "id")}",
                Str(p, "alt_description") ?? Str(p, "description"), Str(p, "description"),
                Str(urls, "regular") ?? "", Str(urls, "small") ?? Str(urls, "regular") ?? "",
                Int(p, "width", 800), Int(p, "height", 1200),
                user.ValueKind == JsonValueKind.Object ? Str(user, "name") : null, avatar,
                p.TryGetProperty("links", out var l) ? Str(l, "html") ?? "https://unsplash.com/" : "https://unsplash.com/",
                Str(p, "color"), null, "unsplash.com"));
        }
        var totalPages = Int(doc.RootElement, "total_pages", page);
        var hasMore = page < totalPages;
        return new PinterestSearchResponse(list, hasMore ? $"unsplash:{page + 1}" : null, hasMore, "unsplash");
    }

    private async Task<PinterestSearchResponse?> SearchOpenverse(string query, int page)
    {
        var req = new HttpRequestMessage(HttpMethod.Get,
            $"https://api.openverse.org/v1/images/?q={Uri.EscapeDataString(query)}&page_size=30&page={page}&mature=false");
        req.Headers.TryAddWithoutValidation("User-Agent", "LifePulse/1.0 (personal productivity app)");
        var res = await _client.SendAsync(req);
        if (!res.IsSuccessStatusCode) return null;
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var list = new List<PinterestPinDto>();
        foreach (var p in doc.RootElement.GetProperty("results").EnumerateArray())
        {
            var url = Str(p, "url");
            if (string.IsNullOrEmpty(url)) continue;
            list.Add(new PinterestPinDto(
                $"openverse_{Str(p, "id")}",
                Str(p, "title"), null,
                url, Str(p, "thumbnail") ?? url,
                Int(p, "width", 800), Int(p, "height", 1000),
                Str(p, "creator"), null,
                Str(p, "foreign_landing_url") ?? url,
                null, Str(p, "provider"), Str(p, "source")));
        }
        var pageCount = Int(doc.RootElement, "page_count", page);
        var hasMore = page < pageCount && page < 20;
        return new PinterestSearchResponse(list, hasMore ? $"openverse:{page + 1}" : null, hasMore, "openverse");
    }

    private static string? Str(JsonElement el, string prop) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(v.GetString())
            ? v.GetString()
            : null;

    private static int Int(JsonElement el, string prop, int fallback) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var i) && i > 0
            ? i
            : fallback;

    // ── GET /api/pinterest/oembed ─────────────────────────────────────────────
    [HttpGet("oembed")]
    public async Task<IActionResult> GetOembed([FromQuery] string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return BadRequest("url is required");
        try
        {
            var res = await _pinterest.GetAsync($"https://www.pinterest.com/oembed.json?url={Uri.EscapeDataString(url)}");
            if (res.IsSuccessStatusCode)
                return Content(await res.Content.ReadAsStringAsync(), "application/json");
            return StatusCode((int)res.StatusCode);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to fetch oEmbed for {Url}", url);
            return StatusCode(500, new { message = "Failed to fetch Pinterest oEmbed" });
        }
    }

    private static List<PinterestPinDto> ParsePinterestJson(string json, out string? nextBookmark)
    {
        nextBookmark = null;
        var list = new List<PinterestPinDto>();
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (!root.TryGetProperty("resource_response", out var resp)) return list;
            if (resp.TryGetProperty("bookmark", out var bm) && bm.ValueKind == JsonValueKind.String)
                nextBookmark = bm.GetString();
            if (!resp.TryGetProperty("data", out var data)) return list;

            JsonElement resultsArray;
            if (data.TryGetProperty("results", out var r) && r.ValueKind == JsonValueKind.Array)
                resultsArray = r;
            else if (data.ValueKind == JsonValueKind.Array)
                resultsArray = data;
            else return list;

            foreach (var item in resultsArray.EnumerateArray())
            {
                var pin = ParsePinElement(item);
                if (pin != null) list.Add(pin);
            }
        }
        catch { /* ignore parse errors */ }
        return list;
    }

    private static PinterestPinDto? ParsePinElement(JsonElement item)
    {
        try
        {
            if (item.TryGetProperty("type", out var t) && t.GetString() != "pin" && !item.TryGetProperty("images", out _))
                return null;

            var id = item.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
            if (string.IsNullOrEmpty(id)) return null;

            string? title = null;
            if (item.TryGetProperty("title", out var tEl) && !string.IsNullOrWhiteSpace(tEl.GetString())) title = tEl.GetString();
            else if (item.TryGetProperty("grid_title", out var gtEl) && !string.IsNullOrWhiteSpace(gtEl.GetString())) title = gtEl.GetString();

            string? desc = item.TryGetProperty("description", out var dEl) ? dEl.GetString() : null;

            string? highResUrl = null, thumbUrl = null;
            int width = 736, height = 1104;

            if (item.TryGetProperty("images", out var images))
            {
                foreach (var key in new[] { "orig", "736x", "474x", "236x" })
                {
                    if (images.TryGetProperty(key, out var img))
                    {
                        var u = img.TryGetProperty("url", out var uel) ? uel.GetString() : null;
                        if (highResUrl == null && u != null)
                        {
                            highResUrl = u;
                            if (img.TryGetProperty("width", out var w)) width = w.GetInt32();
                            if (img.TryGetProperty("height", out var h)) height = h.GetInt32();
                        }
                        if (key == "236x") thumbUrl = u;
                    }
                }
            }

            if (string.IsNullOrEmpty(highResUrl)) return null;
            thumbUrl ??= highResUrl;

            string? pinnerName = null, pinnerAvatar = null;
            if (item.TryGetProperty("pinner", out var pinner))
            {
                if (pinner.TryGetProperty("full_name", out var fn) && !string.IsNullOrWhiteSpace(fn.GetString())) pinnerName = fn.GetString();
                else if (pinner.TryGetProperty("username", out var un)) pinnerName = un.GetString();
                if (pinner.TryGetProperty("image_small_url", out var av)) pinnerAvatar = av.GetString();
            }

            string? boardName = null;
            if (item.TryGetProperty("board", out var board) && board.TryGetProperty("name", out var bn)) boardName = bn.GetString();

            string? color = item.TryGetProperty("dominant_color", out var dc) ? dc.GetString() : null;
            string? domain = item.TryGetProperty("domain", out var dm) ? dm.GetString() : null;

            return new PinterestPinDto(id, title, desc, highResUrl, thumbUrl, width, height,
                pinnerName ?? "Pinterest Creator", pinnerAvatar, $"https://www.pinterest.com/pin/{id}/",
                color, boardName, domain);
        }
        catch { return null; }
    }

    private static List<PinterestPinDto> ExtractPinsFromHtml(string html)
    {
        var list = new List<PinterestPinDto>();
        var matches = Regex.Matches(html, @"https://i\.pinimg\.com/(?:736x|originals|564x|474x|236x)/([a-f0-9/]+\.(?:jpg|png|webp))", RegexOptions.IgnoreCase);
        var seen = new HashSet<string>();
        var idx = 1;
        foreach (Match m in matches)
        {
            var path = m.Groups[1].Value;
            if (!seen.Add(path)) continue;
            list.Add(new PinterestPinDto(
                $"pin_{idx++}", "Pinterest Inspiration", null,
                $"https://i.pinimg.com/736x/{path}", $"https://i.pinimg.com/236x/{path}",
                736, 1104, "Pinterest", null, "https://www.pinterest.com/", "#1a1a2e", null, "pinterest.com"));
            if (list.Count >= 24) break;
        }
        return list;
    }
}
