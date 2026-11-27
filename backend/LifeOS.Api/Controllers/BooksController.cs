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
/// Free public-domain books from Project Gutenberg. Search goes through Gutendex
/// (a Gutenberg catalogue API); book text is fetched from gutenberg.org and trimmed
/// of the licence header/footer. The browser can't call these sites directly (CORS),
/// so the server fetches them.
/// </summary>
[ApiController]
[Authorize]
[Route("api/books")]
public partial class BooksController(IHttpClientFactory httpClientFactory, ILogger<BooksController> logger) : ControllerBase
{
    private const int MaxTextBytes = 8 * 1024 * 1024;
    private const int CacheSize = 20;
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

    // GET /api/books/search?q=&topic=&page=
    [HttpGet("search")]
    public async Task<ActionResult<BookSearchResponse>> Search([FromQuery] string? q, [FromQuery] string? topic, [FromQuery] int page = 1)
    {
        page = Math.Clamp(page, 1, 200);
        var qs = new List<string> { "languages=en", $"page={page}" };
        if (!string.IsNullOrWhiteSpace(q)) qs.Add($"search={Uri.EscapeDataString(q.Trim()[..Math.Min(q.Trim().Length, 120)])}");
        if (!string.IsNullOrWhiteSpace(topic)) qs.Add($"topic={Uri.EscapeDataString(topic.Trim()[..Math.Min(topic.Trim().Length, 60)])}");
        var url = "https://gutendex.com/books/?" + string.Join("&", qs);

        if (SearchCache.TryGetValue(url, out var hit) && DateTime.UtcNow - hit.At < TimeSpan.FromHours(6))
            return Ok(hit.Res);

        try
        {
            var res = await _client.GetAsync(url);
            if (!res.IsSuccessStatusCode)
                return StatusCode(502, new { message = "The book catalogue didn't respond. Try again in a moment." });

            using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
            var root = doc.RootElement;
            var books = new List<BookDto>();
            foreach (var b in root.GetProperty("results").EnumerateArray())
            {
                if (b.TryGetProperty("copyright", out var cr) && cr.ValueKind == JsonValueKind.True) continue;
                var formats = b.TryGetProperty("formats", out var f) ? f : default;
                string? cover = null;
                var hasText = false;
                if (formats.ValueKind == JsonValueKind.Object)
                {
                    foreach (var fmt in formats.EnumerateObject())
                    {
                        if (fmt.Name.StartsWith("image/")) cover ??= fmt.Value.GetString();
                        if (fmt.Name.StartsWith("text/plain") || fmt.Name.StartsWith("text/html")) hasText = true;
                    }
                }
                var authors = b.TryGetProperty("authors", out var a)
                    ? a.EnumerateArray().Select(x => FlipName(x.GetProperty("name").GetString() ?? "")).Where(x => x.Length > 0).ToList()
                    : [];
                var subjects = b.TryGetProperty("subjects", out var s)
                    ? s.EnumerateArray().Select(x => (x.GetString() ?? "").Split(" -- ")[0]).Distinct().Take(4).ToList()
                    : [];
                string? summary = null;
                if (b.TryGetProperty("summaries", out var sm) && sm.ValueKind == JsonValueKind.Array && sm.GetArrayLength() > 0)
                    summary = sm[0].GetString()?.Replace(" (This is an automatically generated summary.)", "");

                books.Add(new BookDto(
                    b.GetProperty("id").GetInt32(),
                    b.GetProperty("title").GetString() ?? "Untitled",
                    authors, cover, subjects,
                    b.TryGetProperty("download_count", out var dc) && dc.ValueKind == JsonValueKind.Number ? dc.GetInt32() : 0,
                    summary, hasText));
            }

            var count = root.TryGetProperty("count", out var c) && c.ValueKind == JsonValueKind.Number ? c.GetInt32() : books.Count;
            var hasNext = root.TryGetProperty("next", out var n) && n.ValueKind == JsonValueKind.String;
            var result = new BookSearchResponse(books, count, hasNext ? page + 1 : null);
            if (SearchCache.Count > 200) SearchCache.Clear();
            SearchCache[url] = (result, DateTime.UtcNow);
            return Ok(result);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Book search failed: {Url}", url);
            return StatusCode(502, new { message = "The book catalogue didn't respond. Try again in a moment." });
        }
    }

    // GET /api/books/{id}/text
    [HttpGet("{id:int}/text")]
    public async Task<ActionResult<BookTextDto>> Text(int id)
    {
        if (id <= 0) return BadRequest();
        if (TextCache.TryGetValue(id, out var cached))
        {
            TextCache[id] = (cached.Text, DateTime.UtcNow);
            return Ok(new BookTextDto(id, cached.Text));
        }

        string[] urls =
        [
            $"https://www.gutenberg.org/cache/epub/{id}/pg{id}.txt",
            $"https://www.gutenberg.org/files/{id}/{id}-0.txt",
            $"https://www.gutenberg.org/files/{id}/{id}.txt",
        ];

        foreach (var url in urls)
        {
            try
            {
                using var res = await _client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
                if (!res.IsSuccessStatusCode) continue;
                if (res.Content.Headers.ContentLength is > MaxTextBytes) return StatusCode(413, new { message = "This book is too large to open here." });

                var raw = await res.Content.ReadAsStringAsync();
                if (raw.Length > MaxTextBytes) return StatusCode(413, new { message = "This book is too large to open here." });

                var text = CleanText(raw);
                if (text.Length < 200) continue;

                if (TextCache.Count >= CacheSize)
                {
                    var oldest = TextCache.OrderBy(kv => kv.Value.UsedAt).First().Key;
                    TextCache.TryRemove(oldest, out _);
                }
                TextCache[id] = (text, DateTime.UtcNow);
                return Ok(new BookTextDto(id, text));
            }
            catch (Exception ex)
            {
                logger.LogInformation(ex, "Couldn't fetch {Url}", url);
            }
        }
        return NotFound(new { message = "This book's text isn't available right now." });
    }

    /// <summary>Drop the Project Gutenberg licence header and footer, normalise line endings.</summary>
    private static string CleanText(string raw)
    {
        var text = raw.Replace("\r\n", "\n").Replace('\r', '\n');
        var start = StartMarker().Match(text);
        if (start.Success)
        {
            var lineEnd = text.IndexOf('\n', start.Index);
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

    [GeneratedRegex(@"\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*", RegexOptions.IgnoreCase)]
    private static partial Regex StartMarker();

    [GeneratedRegex(@"\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG EBOOK", RegexOptions.IgnoreCase)]
    private static partial Regex EndMarker();
}
