using LifeOS.Api.Data;
using LifeOS.Api.Dtos.Items;
using LifeOS.Api.Models;
using LifeOS.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/items")]
public class ItemsController(AppDbContext db) : ControllerBase
{
    // Rich-text notebook pages are stored as JSON; images/files are uploaded separately.
    private const int MaxContentLength = 1_000_000;

    // ── GET /api/items ────────────────────────────────────────────────────────
    [HttpGet]
    public async Task<ActionResult<List<ItemDto>>> GetAll()
    {
        var userId = TokenService.GetUserId(User);
        var items = await db.Items
            .Where(i => i.UserId == userId)
            .OrderByDescending(i => i.UpdatedAt)
            .Select(i => ToDto(i))
            .ToListAsync();
        return Ok(items);
    }

    // ── POST /api/items ───────────────────────────────────────────────────────
    [HttpPost]
    public async Task<ActionResult<ItemDto>> Create([FromBody] CreateItemRequest req)
    {
        var userId = TokenService.GetUserId(User);

        if (!Enum.TryParse<ItemType>(ToPascalCase(req.Type), out var itemType))
            return BadRequest(new { message = $"Invalid item type: {req.Type}" });

        if (req.Content is not null && req.Content.Length > MaxContentLength)
            return BadRequest(new { message = "Content is too large (max 1 MB). Large images and files are uploaded separately — try removing some pasted content." });

        if (req.ParentId.HasValue)
        {
            var parentError = await ValidateParentAsync(userId, req.ParentId.Value, null);
            if (parentError is not null) return BadRequest(new { message = parentError });
        }

        var item = new Item
        {
            UserId = userId,
            Type = itemType,
            Title = req.Title,
            Content = req.Content,
            ParentId = req.ParentId,
            FolderId = req.FolderId,
            Color = req.Color,
            Tags = req.Tags ?? [],
            DueDate = req.DueDate,
            EventDate = req.EventDate,
            StartAt = req.StartAt,
            EndAt = req.EndAt,
            PosX = req.PosX,
            PosY = req.PosY,
            Width = req.Width,
            Height = req.Height,
            Priority = req.Priority,
            Pinned = req.Pinned ?? false,
            Completed = req.Completed ?? false,
        };

        if (item.StartAt.HasValue && item.EndAt.HasValue && item.EndAt <= item.StartAt)
            return BadRequest(new { message = "End time must be after start time." });

        db.Items.Add(item);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAll), ToDto(item));
    }

    // ── PATCH /api/items/{id} ─────────────────────────────────────────────────
    [HttpPatch("{id:guid}")]
    public async Task<ActionResult<ItemDto>> Update(Guid id, [FromBody] UpdateItemRequest req)
    {
        var userId = TokenService.GetUserId(User);
        var item = await db.Items.FirstOrDefaultAsync(i => i.Id == id && i.UserId == userId);
        if (item is null) return NotFound();

        if (req.Title is not null) item.Title = req.Title;
        if (req.Content is not null)
        {
            if (req.Content.Length > MaxContentLength)
                return BadRequest(new { message = "Content is too large (max 1 MB). Large images and files are uploaded separately — try removing some pasted content." });
            item.Content = req.Content;
        }
        if (req.Color is not null) item.Color = req.Color;
        if (req.Tags is not null) item.Tags = req.Tags;
        if (req.Priority is not null) item.Priority = req.Priority;
        if (req.Completed.HasValue) item.Completed = req.Completed.Value;
        if (req.Pinned.HasValue) item.Pinned = req.Pinned.Value;
        if (req.Archived.HasValue) item.Archived = req.Archived.Value;
        if (req.PosX.HasValue) item.PosX = req.PosX;
        if (req.PosY.HasValue) item.PosY = req.PosY;
        if (req.Width.HasValue) item.Width = req.Width;
        if (req.Height.HasValue) item.Height = req.Height;

        // Explicit null-clearing
        if (req.ClearParentId == true) item.ParentId = null;
        else if (req.ParentId.HasValue && req.ParentId != item.ParentId)
        {
            var parentError = await ValidateParentAsync(userId, req.ParentId.Value, item.Id);
            if (parentError is not null) return BadRequest(new { message = parentError });
            item.ParentId = req.ParentId;
        }

        if (req.ClearFolderId == true) item.FolderId = null;
        else if (req.FolderId.HasValue) item.FolderId = req.FolderId;

        if (req.ClearDueDate == true) item.DueDate = null;
        else if (req.DueDate.HasValue) item.DueDate = req.DueDate;

        if (req.ClearEventDate == true) item.EventDate = null;
        else if (req.EventDate.HasValue) item.EventDate = req.EventDate;

        if (req.ClearStartAt == true) item.StartAt = null;
        else if (req.StartAt.HasValue) item.StartAt = req.StartAt;

        if (req.ClearEndAt == true) item.EndAt = null;
        else if (req.EndAt.HasValue) item.EndAt = req.EndAt;

        if (item.StartAt.HasValue && item.EndAt.HasValue && item.EndAt <= item.StartAt)
            return BadRequest(new { message = "End time must be after start time." });

        await db.SaveChangesAsync();
        return Ok(ToDto(item));
    }

    // ── DELETE /api/items/{id} ────────────────────────────────────────────────
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = TokenService.GetUserId(User);
        var item = await db.Items.FirstOrDefaultAsync(i => i.Id == id && i.UserId == userId);
        if (item is null) return NotFound();

        db.Items.Remove(item);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static ItemDto ToDto(Item i) => new(
        i.Id, i.UserId,
        ToSnakeCase(i.Type.ToString()),
        i.Title, i.Content, i.ParentId, i.FolderId, i.Color, i.Tags,
        i.DueDate, i.EventDate,
        i.StartAt, i.EndAt,
        i.PosX, i.PosY, i.Width, i.Height,
        i.Priority, i.Completed, i.Pinned, i.Archived,
        i.CreatedAt, i.UpdatedAt
    );

    /// <summary>Sub-tasks are one level deep: the parent must be the user's own top-level task.</summary>
    private async Task<string?> ValidateParentAsync(Guid userId, Guid parentId, Guid? selfId)
    {
        if (selfId == parentId) return "A task can't be its own parent.";
        var parent = await db.Items.AsNoTracking().FirstOrDefaultAsync(i => i.Id == parentId && i.UserId == userId);
        if (parent is null) return "Parent task not found.";
        if (parent.Type != ItemType.Task) return "Only tasks can contain sub-tasks.";
        if (parent.ParentId is not null) return "Sub-tasks can't have their own sub-tasks.";
        if (selfId is not null && await db.Items.AnyAsync(i => i.ParentId == selfId))
            return "This task has its own sub-tasks, so it can't be moved inside another task.";
        return null;
    }

    // "notebook_page" → "NotebookPage"
    private static string ToPascalCase(string s) =>
        string.Join("", s.Split('_').Select(w => char.ToUpper(w[0]) + w[1..]));

    // "NotebookPage" → "notebook_page"  |  "Sticky" → "sticky"
    private static string ToSnakeCase(string s) =>
        string.Concat(s.Select((c, i) =>
            i > 0 && char.IsUpper(c) ? "_" + char.ToLower(c) : char.ToLower(c).ToString()));
}
