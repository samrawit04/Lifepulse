using System.Text.Json;
using System.Text.RegularExpressions;
using LifeOS.Api.Data;
using LifeOS.Api.Dtos.Settings;
using LifeOS.Api.Models;
using LifeOS.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Api.Controllers;

/// <summary>
/// Server-side per-user preferences (quick search words, saved pins, pinned folders, ...).
/// </summary>
[ApiController]
[Authorize]
[Route("api/settings")]
public partial class SettingsController(AppDbContext db) : ControllerBase
{
    private const int MaxValueLength = 500_000;

    [GeneratedRegex("^[a-z0-9_-]{1,100}$")]
    private static partial Regex KeyPattern();

    // ── GET /api/settings/{key} ──────────────────────────────────────────────
    [HttpGet("{key}")]
    public async Task<ActionResult<SettingDto>> Get(string key)
    {
        if (!KeyPattern().IsMatch(key)) return BadRequest(new { message = "Invalid setting key." });

        var userId = TokenService.GetUserId(User);
        var setting = await db.UserSettings.AsNoTracking()
            .FirstOrDefaultAsync(s => s.UserId == userId && s.Key == key);

        if (setting is null) return Ok(new SettingDto(key, null));

        using var doc = JsonDocument.Parse(setting.Value);
        return Ok(new SettingDto(key, doc.RootElement.Clone()));
    }

    // ── PUT /api/settings/{key} ──────────────────────────────────────────────
    [HttpPut("{key}")]
    public async Task<ActionResult<SettingDto>> Put(string key, [FromBody] PutSettingRequest req)
    {
        if (!KeyPattern().IsMatch(key)) return BadRequest(new { message = "Invalid setting key." });

        var raw = req.Value.GetRawText();
        if (raw.Length > MaxValueLength)
            return BadRequest(new { message = "Setting value is too large." });

        var userId = TokenService.GetUserId(User);
        var setting = await db.UserSettings.FirstOrDefaultAsync(s => s.UserId == userId && s.Key == key);
        if (setting is null)
        {
            setting = new UserSetting { UserId = userId, Key = key, Value = raw };
            db.UserSettings.Add(setting);
        }
        else
        {
            setting.Value = raw;
        }

        await db.SaveChangesAsync();
        return Ok(new SettingDto(key, req.Value));
    }

    // ── DELETE /api/settings/{key} ───────────────────────────────────────────
    [HttpDelete("{key}")]
    public async Task<IActionResult> Delete(string key)
    {
        var userId = TokenService.GetUserId(User);
        var setting = await db.UserSettings.FirstOrDefaultAsync(s => s.UserId == userId && s.Key == key);
        if (setting is null) return NoContent();
        db.UserSettings.Remove(setting);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
