namespace LifeOS.Api.Models;

/// <summary>
/// Per-user key/value preference stored server-side (replaces browser localStorage).
/// Value is a raw JSON document, e.g. ["lofi","jazz"] or {"a":1}.
/// </summary>
public class UserSetting
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = "null";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
