using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Controllers;

public record BookDto(
    int Id,
    string Title,
    List<string> Authors,
    string? Cover,
    List<string> Subjects,
    int Downloads,
    string? Summary,
    bool HasText);

public record BookSearchResponse(List<BookDto> Books, int Count, int? NextPage);

public record BookTextDto(int Id, string Text);

/// <summary>
/// Free public-domain books from Project Gutenberg. Search and text come from
/// gutenberg.org when it answers, otherwise from the Gutenberg collection on archive.org.
/// The server fetches the text so it can be sent to the browser compressed.
/// </summary>
[ApiController]
[Authorize]
[Route("api/books")]
public partial class BooksController(IHttpClientFactory httpClientFactory, ILogger<BooksController> logger) : ControllerBase
{
    private const int MaxTextBytes = 8 * 1024 * 1024;
    private const int CacheSize = 20;
    private const int MinBookChars = 20_000;
    private readonly HttpClient _client = CreateClient(httpClientFactory);

    // Small in-memory cache so re-opening a book (or a popular row) doesn't refetch it
    private static readonly ConcurrentDictionary<int, (string Text, DateTime UsedAt)> TextCache = new();
    private static readonly ConcurrentDictionary<string, (BookSearchResponse Res, DateTime At)> SearchCache = new();

    private static HttpClient CreateClient(IHttpClientFactory f)
    {
        var c = f.CreateClient();
        c.Timeout = TimeSpan.FromSeconds(25);
        c.DefaultRequestHeaders.UserAgent.ParseAdd("LifePulse/1.0 (personal reading app)");
        return c;
    }

    // GET /api/books/search?q=&page=
    // Searches the Project Gutenberg collection on archive.org (fast and reliable; the
    // Gutendex catalogue we used before was often down).
    [HttpGet("search")]
    public async Task<ActionResult<BookSearchResponse>> Search([FromQuery] string? q, [FromQuery] string? topic, [FromQuery] int page = 1)
    {
        page = Math.Clamp(page, 1, 100);
        var term = (q ?? topic ?? "").Trim();
        if (term.Length > 120) term = term[..120];
        var safe = Regex.Replace(term, @"[^\p{L}\p{N}\s'\-]", " ").Trim();
        var query = "collection:gutenberg AND mediatype:texts AND language:(eng OR English)";
        if (safe.Length > 0) query += $" AND (title:({safe}) OR creator:({safe}) OR subject:({safe}))";
        var url = "https://archive.org/advancedsearch.php?q=" + Uri.EscapeDataString(query) +
                  "&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=subject&fl[]=downloads&sort[]=downloads+desc" +
                  $"&rows=30&page={page}&output=json";

        if (SearchCache.TryGetValue(url, out var hit) && DateTime.UtcNow - hit.At < TimeSpan.FromHours(6))
            return Ok(hit.Res);

        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(12));
            var res = await _client.GetAsync(url, cts.Token);
            if (!res.IsSuccessStatusCode)
                return StatusCode(502, new { message = "Book search didn't respond. Try again in a moment." });

            using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(cts.Token));
            var response = doc.RootElement.GetProperty("response");
            var books = new List<BookDto>();
            foreach (var d in response.GetProperty("docs").EnumerateArray())
            {
                var ident = Str(d, "identifier") ?? "";
                var m = PgIdFromIdentifier().Match(ident);
                if (!m.Success) continue;
                var id = int.Parse(m.Groups[1].Value);
                if (books.Any(b => b.Id == id)) continue;
                var creator = FirstOrSelf(d, "creator");
                var subjects = d.TryGetProperty("subject", out var sj)
                    ? (sj.ValueKind == JsonValueKind.Array ? sj.EnumerateArray().Select(x => x.GetString() ?? "") : new[] { sj.GetString() ?? "" })
                        .Select(x => x.Split(" -- ")[0]).Where(x => x.Length > 0).Distinct().Take(4).ToList()
                    : new List<string>();
                books.Add(new BookDto(id, Str(d, "title") ?? "Untitled",
                    creator is null ? new List<string>() : new List<string> { CleanAuthor(creator) }, null, subjects,
                    d.TryGetProperty("downloads", out var dl) && dl.ValueKind == JsonValueKind.Number ? dl.GetInt32() : 0,
                    null, true));
            }
            var count = response.TryGetProperty("numFound", out var nf) ? nf.GetInt32() : books.Count;
            var result = new BookSearchResponse(books, count, page * 30 < count ? page + 1 : null);
            if (SearchCache.Count > 200) SearchCache.Clear();
            SearchCache[url] = (result, DateTime.UtcNow);
            return Ok(result);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Book search failed for {Term}", term);
            return StatusCode(502, new { message = "Book search didn't respond. Try again in a moment." });
        }
    }

    // GET /api/books/{id}/text
    // Tries gutenberg.org first, then the copy of the same Gutenberg book on archive.org
    // (gutenberg.org often refuses requests from cloud servers).
    [HttpGet("{id:int}/text")]
    public async Task<ActionResult<BookTextDto>> Text(int id)
    {
        if (id <= 0) return BadRequest();
        if (TextCache.TryGetValue(id, out var cached))
        {
            TextCache[id] = (cached.Text, DateTime.UtcNow);
            return Ok(new BookTextDto(id, cached.Text));
        }

        var text = await FromGutenberg(id) ?? await FromArchive(id);
        if (text is null)
        {
            logger.LogWarning("No text found for Gutenberg book {Id}", id);
            return NotFound(new { message = "This book's text isn't available right now." });
        }

        if (TextCache.Count >= CacheSize)
        {
            var oldest = TextCache.OrderBy(kv => kv.Value.UsedAt).First().Key;
            TextCache.TryRemove(oldest, out _);
        }
        TextCache[id] = (text, DateTime.UtcNow);
        return Ok(new BookTextDto(id, text));
    }

    private async Task<string?> FromGutenberg(int id)
    {
        string[] urls =
        [
            $"https://www.gutenberg.org/cache/epub/{id}/pg{id}.txt",
            $"https://www.gutenberg.org/files/{id}/{id}-0.txt",
        ];
        foreach (var url in urls)
        {
            var raw = await Download(url, TimeSpan.FromSeconds(7));
            if (raw is null) continue;
            var text = CleanText(raw);
            if (text.Length >= MinBookChars) return text;
        }
        return null;
    }

    private async Task<string?> FromArchive(int id)
    {
        try
        {
            // archive.org names Gutenberg items like "walden00205gut"
            var pad = id.ToString("D5");
            var q = Uri.EscapeDataString($"collection:gutenberg AND identifier:*{pad}gut");
            var search = await GetJson($"https://archive.org/advancedsearch.php?q={q}&fl[]=identifier&rows=5&output=json", TimeSpan.FromSeconds(10));
            if (search is null) return null;
            var idents = search.Value.GetProperty("response").GetProperty("docs").EnumerateArray()
                .Select(d => Str(d, "identifier"))
                .Where(x => x != null && x.EndsWith(pad + "gut"))
                .Cast<string>()
                .ToList();

            foreach (var ident in idents)
            {
                var files = await GetJson($"https://archive.org/metadata/{ident}/files", TimeSpan.FromSeconds(10));
                if (files is null || !files.Value.TryGetProperty("result", out var list)) continue;

                // Pick the real book text: biggest .txt that isn't a readme, else an .htm(l) page
                var candidates = list.EnumerateArray()
                    .Select(f => (Name: Str(f, "name") ?? "", Size: long.TryParse(Str(f, "size"), out var sz) ? sz : 0))
                    .Where(f => !f.Name.Contains('/') && !f.Name.Contains("readme", StringComparison.OrdinalIgnoreCase) && f.Size >= MinBookChars && f.Size <= MaxTextBytes)
                    .ToList();
                var pick = candidates.Where(f => f.Name.EndsWith(".txt", StringComparison.OrdinalIgnoreCase)).OrderByDescending(f => f.Size).FirstOrDefault();
                var isHtml = false;
                if (pick.Name is null or "")
                {
                    pick = candidates.Where(f => f.Name.EndsWith(".htm", StringComparison.OrdinalIgnoreCase) || f.Name.EndsWith(".html", StringComparison.OrdinalIgnoreCase))
                        .OrderByDescending(f => f.Size).FirstOrDefault();
                    isHtml = true;
                }
                if (pick.Name is null or "") continue;

                var raw = await Download($"https://archive.org/download/{ident}/{Uri.EscapeDataString(pick.Name)}", TimeSpan.FromSeconds(25));
                if (raw is null) continue;
                var text = CleanText(isHtml ? HtmlToText(raw) : raw);
                if (text.Length >= MinBookChars) return text;
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "archive.org lookup failed for book {Id}", id);
        }
        return null;
    }

    private async Task<string?> Download(string url, TimeSpan timeout)
    {
        try
        {
            using var cts = new CancellationTokenSource(timeout);
            using var res = await _client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, cts.Token);
            if (!res.IsSuccessStatusCode)
            {
                logger.LogInformation("Book download {Url} returned {Status}", url, (int)res.StatusCode);
                return null;
            }
            if (res.Content.Headers.ContentLength is > MaxTextBytes) return null;
            var raw = await res.Content.ReadAsStringAsync(cts.Token);
            return raw.Length > MaxTextBytes ? null : raw;
        }
        catch (Exception ex)
        {
            logger.LogInformation("Book download {Url} failed: {Error}", url, ex.Message);
            return null;
        }
    }

    private async Task<JsonElement?> GetJson(string url, TimeSpan timeout)
    {
        var raw = await Download(url, timeout);
        if (raw is null) return null;
        using var doc = JsonDocument.Parse(raw);
        return doc.RootElement.Clone();
    }

    private static string HtmlToText(string html)
    {
        var body = Regex.Replace(html, @"<(script|style|head)[\s\S]*?</\1>", "", RegexOptions.IgnoreCase);
        body = Regex.Replace(body, @"<\s*(br|/p|/div|/h[1-6]|/li|/tr)\s*/?>", "\n\n", RegexOptions.IgnoreCase);
        body = Regex.Replace(body, "<[^>]+>", "");
        body = System.Net.WebUtility.HtmlDecode(body);
        return Regex.Replace(body, @"\n{3,}", "\n\n");
    }

    private static string? Str(JsonElement el, string prop) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(prop, out var v)
            ? v.ValueKind switch { JsonValueKind.String => v.GetString(), JsonValueKind.Number => v.GetRawText(), _ => null }
            : null;

    private static string? FirstOrSelf(JsonElement el, string prop) =>
        el.TryGetProperty(prop, out var v)
            ? v.ValueKind == JsonValueKind.Array ? (v.GetArrayLength() > 0 ? v[0].GetString() : null) : v.GetString()
            : null;

    /// <summary>"Austen, Jane, 1775-1817" → "Jane Austen".</summary>
    private static string CleanAuthor(string raw)
    {
        var noDates = Regex.Replace(raw, @",?\s*(\d{3,4}\??\s*(BC)?\s*-\s*\d{0,4}\??\s*(BC)?|\[.*?\]|\(.*?\))", "").Trim().TrimEnd(',');
        return FlipName(noDates);
    }

    /// <summary>Drop the Project Gutenberg licence header and footer (old and new styles), normalise line endings.</summary>
    private static string CleanText(string raw)
    {
        var text = raw.Replace("\r\n", "\n").Replace('\r', '\n');
        var start = StartMarker().Match(text);
        if (start.Success)
        {
            var lineEnd = text.IndexOf('\n', start.Index + start.Length);
            text = lineEnd >= 0 ? text[(lineEnd + 1)..] : text;
        }
        var end = EndMarker().Match(text);
        if (end.Success) text = text[..end.Index];
        return text.Trim();
    }

    /// <summary>"Austen, Jane" → "Jane Austen".</summary>
    private static string FlipName(string name)
    {
        var parts = name.Split(", ", 2);
        return parts.Length == 2 && !parts[1].Contains(',') ? $"{parts[1]} {parts[0]}" : name;
    }

    [GeneratedRegex(@"(\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG E-?BOOK[^\n]*|\*END\*THE SMALL PRINT[^\n]*)", RegexOptions.IgnoreCase)]
    private static partial Regex StartMarker();

    [GeneratedRegex(@"(\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG E-?BOOK|End of (the )?Project Gutenberg'?s? (E-?text|E-?Book|Etext)?)", RegexOptions.IgnoreCase)]
    private static partial Regex EndMarker();

    [GeneratedRegex(@"(\d{5})gut$")]
    private static partial Regex PgIdFromIdentifier();
}
