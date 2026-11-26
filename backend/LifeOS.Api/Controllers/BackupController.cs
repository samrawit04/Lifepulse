using LifeOS.Api.Data;
using LifeOS.Api.Filters;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Api.Controllers;

/// <summary>
/// Database maintenance endpoints. Every action requires the X-Admin-Key header
/// (see <see cref="AdminKeyAttribute"/>); they are disabled when no key is configured.
/// </summary>
[ApiController]
[AdminKey]
[Route("api/admin/backup")]
public class BackupController(AppDbContext db) : ControllerBase
{
    public const string ClearConfirmHeader = "X-Confirm-Clear";
    public const string ClearConfirmValue = "DELETE ALL DATA";

    // GET /api/admin/backup/status
    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        long dbSizeBytes = 0;
        try
        {
            using var cmd = db.Database.GetDbConnection().CreateCommand();
            cmd.CommandText = "SELECT pg_database_size(current_database());";
            await db.Database.OpenConnectionAsync();
            var result = await cmd.ExecuteScalarAsync();
            if (result != null && result != DBNull.Value)
            {
                dbSizeBytes = Convert.ToInt64(result);
            }
        }
        catch
        {
            // Ignore if non-PostgreSQL DB during testing
        }

        var counts = new
        {
            users = await db.Users.CountAsync(),
            folders = await db.Folders.CountAsync(),
            items = await db.Items.CountAsync(),
            expenses = await db.Expenses.CountAsync(),
            playlists = await db.Playlists.CountAsync(),
            playlistItems = await db.PlaylistItems.CountAsync(),
            notifications = await db.Notifications.CountAsync(),
            plannedPurchases = await db.PlannedPurchases.CountAsync(),
            categoryBudgets = await db.CategoryBudgets.CountAsync(),
            userSettings = await db.UserSettings.CountAsync()
        };

        return Ok(new
        {
            databaseSizeBytes = dbSizeBytes,
            databaseSizeFormatted = $"{Math.Round(dbSizeBytes / (1024.0 * 1024.0), 2)} MB",
            dbHost = db.Database.GetDbConnection().DataSource,
            dbName = db.Database.GetDbConnection().Database,
            timestamp = DateTime.UtcNow,
            counts
        });
    }

    // POST /api/admin/backup/clear-all-data
    [HttpPost("clear-all-data")]
    public async Task<IActionResult> ClearAllData()
    {
        // Extra guard on the destructive action: the caller must also confirm explicitly.
        if (Request.Headers[ClearConfirmHeader].ToString() != ClearConfirmValue)
            return BadRequest(new { message = $"Send header {ClearConfirmHeader}: {ClearConfirmValue} to confirm." });

        await db.Database.ExecuteSqlRawAsync(@"TRUNCATE TABLE ""Items"", ""Folders"", ""Expenses"", ""Playlists"", ""PlaylistItems"", ""Notifications"", ""PlannedPurchases"" CASCADE;");
        return Ok(new { message = "All user data tables cleared successfully!" });
    }

    // GET /api/admin/backup/export
    [HttpGet("export")]
    public async Task<IActionResult> ExportData()
    {
        var users = await db.Users.AsNoTracking().ToListAsync();
        var folders = await db.Folders.AsNoTracking().ToListAsync();
        var items = await db.Items.AsNoTracking().ToListAsync();
        var expenses = await db.Expenses.AsNoTracking().ToListAsync();
        var playlists = await db.Playlists.AsNoTracking().ToListAsync();
        var playlistItems = await db.PlaylistItems.AsNoTracking().ToListAsync();
        var notifications = await db.Notifications.AsNoTracking().ToListAsync();
        var plannedPurchases = await db.PlannedPurchases.AsNoTracking().ToListAsync();
        var categoryBudgets = await db.CategoryBudgets.AsNoTracking().ToListAsync();
        var userSettings = await db.UserSettings.AsNoTracking().ToListAsync();

        var dump = new
        {
            exportedAt = DateTime.UtcNow,
            version = "1.0",
            data = new
            {
                users,
                folders,
                items,
                expenses,
                playlists,
                playlistItems,
                notifications,
                plannedPurchases,
                categoryBudgets,
                userSettings
            }
        };

        return Ok(dump);
    }
}
