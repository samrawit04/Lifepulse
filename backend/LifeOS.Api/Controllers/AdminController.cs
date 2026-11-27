using LifeOS.Api.Data;
using LifeOS.Api.Models;
using LifeOS.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Api.Controllers;

public record AdminMeDto(bool IsAdmin);

public record AdminDayCount(string Date, int Count);

public record AdminUserRow(
    Guid Id,
    string Email,
    string? DisplayName,
    string? AvatarUrl,
    string SignInMethod,
    DateTime JoinedAt,
    DateTime? LastActiveAt,
    int Items,
    int Expenses);

public record AdminStatsDto(
    int TotalUsers,
    int NewUsers7d,
    int NewUsers30d,
    int ActiveUsers7d,
    int ActiveUsers30d,
    int GoogleUsers,
    int EmailUsers,
    int Notes,
    int NotebookPages,
    int Tasks,
    int Events,
    int Expenses,
    int ChatConversations,
    List<AdminDayCount> SignupsByDay,
    List<AdminDayCount> ActiveByDay,
    List<AdminUserRow> Users);

/// <summary>
/// App-wide numbers for the owner. Admins are the accounts whose email is listed in
/// the <c>Admin:Emails</c> setting (env var <c>Admin__Emails</c>, comma-separated).
/// Everyone else gets 403.
/// </summary>
[ApiController]
[Authorize]
[Route("api/admin")]
public class AdminController(AppDbContext db, IConfiguration config) : ControllerBase
{
    private async Task<bool> IsAdmin()
    {
        var allowed = (config["Admin:Emails"] ?? "")
            .Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (allowed.Length == 0) return false;

        var userId = TokenService.GetUserId(User);
        var email = await db.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => u.Email).FirstOrDefaultAsync();
        return email != null && allowed.Contains(email, StringComparer.OrdinalIgnoreCase);
    }

    // GET /api/admin/me — lets the app decide whether to show the Admin tab
    [HttpGet("me")]
    public async Task<ActionResult<AdminMeDto>> Me() => Ok(new AdminMeDto(await IsAdmin()));

    // GET /api/admin/stats
    [HttpGet("stats")]
    public async Task<ActionResult<AdminStatsDto>> Stats()
    {
        if (!await IsAdmin()) return StatusCode(403, new { message = "Admins only." });

        var now = DateTime.UtcNow;
        var d7 = now.AddDays(-7);
        var d30 = now.AddDays(-30);

        var totalUsers = await db.Users.CountAsync();
        var new7 = await db.Users.CountAsync(u => u.CreatedAt >= d7);
        var new30 = await db.Users.CountAsync(u => u.CreatedAt >= d30);
        var google = await db.Users.CountAsync(u => u.GoogleId != null);

        // "Active" = created or changed something (notes, tasks, expenses, chats)
        var activity = await db.Items.Where(i => i.UpdatedAt >= d30).Select(i => new { i.UserId, At = i.UpdatedAt })
            .Concat(db.Expenses.Where(e => e.CreatedAt >= d30).Select(e => new { e.UserId, At = e.CreatedAt }))
            .Concat(db.ChatConversations.Where(c => c.UpdatedAt >= d30).Select(c => new { c.UserId, At = c.UpdatedAt }))
            .AsNoTracking()
            .ToListAsync();

        var active30 = activity.Select(a => a.UserId).Distinct().Count();
        var active7 = activity.Where(a => a.At >= d7).Select(a => a.UserId).Distinct().Count();

        var signupDates = await db.Users.Where(u => u.CreatedAt >= d30).Select(u => u.CreatedAt).ToListAsync();
        var days = Enumerable.Range(0, 30).Select(i => now.Date.AddDays(-29 + i)).ToList();
        var signupsByDay = days
            .Select(d => new AdminDayCount(d.ToString("yyyy-MM-dd"), signupDates.Count(x => x.Date == d)))
            .ToList();
        var activeByDay = days
            .Select(d => new AdminDayCount(d.ToString("yyyy-MM-dd"), activity.Where(a => a.At.Date == d).Select(a => a.UserId).Distinct().Count()))
            .ToList();

        var itemCounts = await db.Items.GroupBy(i => i.Type).Select(g => new { g.Key, Count = g.Count() }).ToListAsync();
        int CountOf(ItemType t) => itemCounts.FirstOrDefault(x => x.Key == t)?.Count ?? 0;

        var users = await db.Users.AsNoTracking()
            .OrderByDescending(u => u.CreatedAt)
            .Take(500)
            .Select(u => new
            {
                u.Id,
                u.Email,
                u.DisplayName,
                u.AvatarUrl,
                Google = u.GoogleId != null,
                Password = u.PasswordHash != null,
                u.CreatedAt,
                Items = db.Items.Count(i => i.UserId == u.Id),
                Expenses = db.Expenses.Count(e => e.UserId == u.Id),
                LastItem = db.Items.Where(i => i.UserId == u.Id).Max(i => (DateTime?)i.UpdatedAt),
                LastExpense = db.Expenses.Where(e => e.UserId == u.Id).Max(e => (DateTime?)e.CreatedAt),
                LastChat = db.ChatConversations.Where(c => c.UserId == u.Id).Max(c => (DateTime?)c.UpdatedAt),
            })
            .ToListAsync();

        var rows = users.Select(u => new AdminUserRow(
            u.Id,
            u.Email,
            u.DisplayName,
            u.AvatarUrl,
            u.Google && u.Password ? "Google + email" : u.Google ? "Google" : "Email",
            u.CreatedAt,
            new[] { u.LastItem, u.LastExpense, u.LastChat }.Max(),
            u.Items,
            u.Expenses)).ToList();

        return Ok(new AdminStatsDto(
            totalUsers, new7, new30, active7, active30, google, totalUsers - google,
            CountOf(ItemType.Sticky), CountOf(ItemType.NotebookPage), CountOf(ItemType.Task), CountOf(ItemType.Event),
            await db.Expenses.CountAsync(),
            await db.ChatConversations.CountAsync(),
            signupsByDay, activeByDay, rows));
    }
}
