namespace LifeOS.Api.Models;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Email { get; set; } = string.Empty;
    public string? PasswordHash { get; set; }   // null for Google OAuth-only users
    public string? GoogleId { get; set; }        // set for Google OAuth users
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Profile fields
    public string? DisplayName { get; set; }
    public string? AvatarUrl { get; set; }
    public string? StatusMessage { get; set; }
    public string? Theme { get; set; }
    public string? HiddenSidebarItems { get; set; }  // JSON array string e.g. "["/sticky","/music"]"

    public ICollection<Folder> Folders { get; set; } = [];
    public ICollection<Item> Items { get; set; } = [];
    public ICollection<Expense> Expenses { get; set; } = [];
    public ICollection<Playlist> Playlists { get; set; } = [];
    public ICollection<Notification> Notifications { get; set; } = [];
    public ICollection<PlannedPurchase> PlannedPurchases { get; set; } = [];
    public ICollection<CategoryBudget> CategoryBudgets { get; set; } = [];
}
