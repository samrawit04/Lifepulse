namespace LifeOS.Api.Models;

public class Item
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public ItemType Type { get; set; }
    public string? Title { get; set; }
    public string? Content { get; set; }

    // Sub-tasks: a task can belong to a parent task ("task folder")
    public Guid? ParentId { get; set; }
    public Item? Parent { get; set; }

    public Guid? FolderId { get; set; }
    public Folder? Folder { get; set; }

    public string? Color { get; set; }
    public string[] Tags { get; set; } = [];

    // Calendar events
    public DateTime? EventDate { get; set; }

    // Tasks
    public DateTime? DueDate { get; set; }
    public string? Priority { get; set; }    // "low" | "medium" | "high"
    public bool Completed { get; set; } = false;

    // Scheduled time window (tasks & events)
    public DateTime? StartAt { get; set; }
    public DateTime? EndAt { get; set; }

    // Sticky notes (canvas position/size)
    public double? PosX { get; set; }
    public double? PosY { get; set; }
    public double? Width { get; set; }
    public double? Height { get; set; }
    public bool Pinned { get; set; } = false;

    // Shared
    public bool Archived { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
