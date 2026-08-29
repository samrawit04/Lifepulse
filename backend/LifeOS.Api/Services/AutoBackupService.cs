using LifeOS.Api.Data;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace LifeOS.Api.Services;

public class AutoBackupService(IServiceProvider serviceProvider, ILogger<AutoBackupService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Short initial delay after app launch
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PerformBackupAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error occurred during automated database backup.");
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }

    private async Task PerformBackupAsync(CancellationToken ct)
    {
        using var scope = serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var rootDir = Directory.GetCurrentDirectory();
        // Go up one level if executing inside backend/LifeOS.Api directory
        var backupDir = Path.GetFileName(rootDir) == "LifeOS.Api"
            ? Path.Combine(Directory.GetParent(rootDir)?.Parent?.FullName ?? rootDir, "backups")
            : Path.Combine(rootDir, "backups");

        if (!Directory.Exists(backupDir))
        {
            Directory.CreateDirectory(backupDir);
        }

        var timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd_HH-mm-ss");
        var filePath = Path.Combine(backupDir, $"neon_auto_backup_{timestamp}.json");

        var dump = new
        {
            exportedAt = DateTime.UtcNow,
            source = "AutoBackupService",
            data = new
            {
                users = await db.Users.AsNoTracking().ToListAsync(ct),
                folders = await db.Folders.AsNoTracking().ToListAsync(ct),
                items = await db.Items.AsNoTracking().ToListAsync(ct),
                expenses = await db.Expenses.AsNoTracking().ToListAsync(ct),
                playlists = await db.Playlists.AsNoTracking().ToListAsync(ct),
                playlistItems = await db.PlaylistItems.AsNoTracking().ToListAsync(ct),
                notifications = await db.Notifications.AsNoTracking().ToListAsync(ct),
                plannedPurchases = await db.PlannedPurchases.AsNoTracking().ToListAsync(ct)
            }
        };

        var jsonOptions = new JsonSerializerOptions
        {
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
        };

        await File.WriteAllTextAsync(filePath, JsonSerializer.Serialize(dump, jsonOptions), ct);
        logger.LogInformation("✅ AutoBackupService successfully created database snapshot: {FilePath}", filePath);
    }
}
