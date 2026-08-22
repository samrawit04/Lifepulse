using System.Text.Json;
using System.Text.RegularExpressions;
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

public record PinterestSearchResponse(
    List<PinterestPinDto> Pins,
    string? Bookmark,
    bool HasMore
);

[ApiController]
[Route("api/pinterest")]
public class PinterestController(IHttpClientFactory httpClientFactory, ILogger<PinterestController> logger) : ControllerBase
{
    private readonly HttpClient _client = httpClientFactory.CreateClient();

    // ── GET /api/pinterest/search ─────────────────────────────────────────────
    [HttpGet("search")]
    public async Task<ActionResult<PinterestSearchResponse>> Search([FromQuery] string q, [FromQuery] string? bookmark = null)
    {
        if (string.IsNullOrWhiteSpace(q))
            return Ok(new PinterestSearchResponse([], null, false));

        var query = q.Trim();

        // Attempt 1: Pinterest BaseSearchResource JSON API
        try
        {
            var optionsObj = new Dictionary<string, object> { ["query"] = query, ["scope"] = "pins" };
            if (!string.IsNullOrEmpty(bookmark)) optionsObj["bookmarks"] = new[] { bookmark };

            var jsonPayload = JsonSerializer.Serialize(new { options = optionsObj, context = new { } });
            var encodedSource = Uri.EscapeDataString($"/search/pins/?q={Uri.EscapeDataString(query)}&rs=typed");
            var encodedData = Uri.EscapeDataString(jsonPayload);
            var endpoint = $"https://www.pinterest.com/resource/BaseSearchResource/get/?source_url={encodedSource}&data={encodedData}";

            var req = new HttpRequestMessage(HttpMethod.Get, endpoint);
            req.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36");
            req.Headers.Add("Accept", "application/json, text/javascript, */*; q=0.01");
            req.Headers.Add("X-Requested-With", "XMLHttpRequest");
            req.Headers.Add("Referer", "https://www.pinterest.com/");

            var res = await _client.SendAsync(req);
            if (res.IsSuccessStatusCode)
            {
                var content = await res.Content.ReadAsStringAsync();
                var pins = ParsePinterestJson(content, out var nextBookmark);
                if (pins.Count > 0)
                    return Ok(new PinterestSearchResponse(pins, nextBookmark, !string.IsNullOrEmpty(nextBookmark)));
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Pinterest API attempt failed for query: {Query}", query);
        }

        // Attempt 2: HTML scrape fallback
        try
        {
            var htmlReq = new HttpRequestMessage(HttpMethod.Get, $"https://www.pinterest.com/search/pins/?q={Uri.EscapeDataString(query)}");
            htmlReq.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36");
            htmlReq.Headers.Add("Accept", "text/html,application/xhtml+xml");

            var htmlRes = await _client.SendAsync(htmlReq);
            if (htmlRes.IsSuccessStatusCode)
            {
                var html = await htmlRes.Content.ReadAsStringAsync();
                var pins = ExtractPinsFromHtml(html);
                if (pins.Count > 0)
                    return Ok(new PinterestSearchResponse(pins, null, false));
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Pinterest HTML scrape failed for query: {Query}", query);
        }

        return Ok(new PinterestSearchResponse([], null, false));
    }

    // ── GET /api/pinterest/oembed ─────────────────────────────────────────────
    [HttpGet("oembed")]
    public async Task<IActionResult> GetOembed([FromQuery] string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return BadRequest("url is required");
        try
        {
            var res = await _client.GetAsync($"https://www.pinterest.com/oembed.json?url={Uri.EscapeDataString(url)}");
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
