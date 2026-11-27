using LifeOS.Api.Data;
using LifeOS.Api.Dtos.Chats;
using LifeOS.Api.Models;
using LifeOS.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Api.Controllers;

/// <summary>Stores AI assistant conversations so the assistant remembers past chats.</summary>
[ApiController]
[Authorize]
[Route("api/chats")]
public class ChatsController(AppDbContext db) : ControllerBase
{
    private const int MaxMessageLength = 20_000;
    private const int MaxTitleLength = 120;

    // ── GET /api/chats ───────────────────────────────────────────────────────
    [HttpGet]
    public async Task<ActionResult<List<ChatConversationDto>>> GetAll()
    {
        var userId = TokenService.GetUserId(User);
        var list = await db.ChatConversations
            .Where(c => c.UserId == userId)
            .OrderByDescending(c => c.UpdatedAt)
            .Take(100)
            .Select(c => new ChatConversationDto(c.Id, c.Title, c.Messages.Count, c.CreatedAt, c.UpdatedAt))
            .ToListAsync();
        return Ok(list);
    }

    // ── POST /api/chats ──────────────────────────────────────────────────────
    [HttpPost]
    public async Task<ActionResult<ChatConversationDto>> Create([FromBody] CreateConversationRequest req)
    {
        var userId = TokenService.GetUserId(User);
        var conv = new ChatConversation { UserId = userId, Title = CleanTitle(req.Title) };
        db.ChatConversations.Add(conv);
        await db.SaveChangesAsync();
        return Ok(new ChatConversationDto(conv.Id, conv.Title, 0, conv.CreatedAt, conv.UpdatedAt));
    }

    // ── PATCH /api/chats/{id} ────────────────────────────────────────────────
    [HttpPatch("{id:guid}")]
    public async Task<ActionResult<ChatConversationDto>> Update(Guid id, [FromBody] UpdateConversationRequest req)
    {
        var userId = TokenService.GetUserId(User);
        var conv = await db.ChatConversations.FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId);
        if (conv is null) return NotFound();
        if (req.Title is not null) conv.Title = CleanTitle(req.Title);
        conv.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        var count = await db.ChatMessages.CountAsync(m => m.ConversationId == id);
        return Ok(new ChatConversationDto(conv.Id, conv.Title, count, conv.CreatedAt, conv.UpdatedAt));
    }

    // ── DELETE /api/chats/{id} ───────────────────────────────────────────────
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = TokenService.GetUserId(User);
        var conv = await db.ChatConversations.FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId);
        if (conv is null) return NotFound();
        db.ChatConversations.Remove(conv);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ── GET /api/chats/{id}/messages ─────────────────────────────────────────
    [HttpGet("{id:guid}/messages")]
    public async Task<ActionResult<List<ChatMessageDto>>> GetMessages(Guid id)
    {
        var userId = TokenService.GetUserId(User);
        if (!await db.ChatConversations.AnyAsync(c => c.Id == id && c.UserId == userId)) return NotFound();
        var messages = await db.ChatMessages
            .Where(m => m.ConversationId == id)
            .OrderBy(m => m.CreatedAt)
            .Select(m => new ChatMessageDto(m.Id, m.ConversationId, m.Role, m.Text, m.CreatedAt))
            .ToListAsync();
        return Ok(messages);
    }

    // ── POST /api/chats/{id}/messages ────────────────────────────────────────
    [HttpPost("{id:guid}/messages")]
    public async Task<ActionResult<ChatMessageDto>> AddMessage(Guid id, [FromBody] AddMessageRequest req)
    {
        var userId = TokenService.GetUserId(User);
        var conv = await db.ChatConversations.FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId);
        if (conv is null) return NotFound();

        var role = req.Role == "model" ? "model" : req.Role == "user" ? "user" : null;
        if (role is null) return BadRequest(new { message = "Role must be 'user' or 'model'." });
        if (string.IsNullOrWhiteSpace(req.Text)) return BadRequest(new { message = "Message is empty." });

        var text = req.Text.Length > MaxMessageLength ? req.Text[..MaxMessageLength] : req.Text;
        var msg = new ChatMessage { ConversationId = id, Role = role, Text = text };
        db.ChatMessages.Add(msg);
        conv.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(new ChatMessageDto(msg.Id, msg.ConversationId, msg.Role, msg.Text, msg.CreatedAt));
    }

    // ── GET /api/chats/recent-messages?limit=30 ──────────────────────────────
    // Latest messages across all conversations — gives the assistant memory of past chats.
    [HttpGet("recent-messages")]
    public async Task<ActionResult<List<ChatMessageDto>>> RecentMessages([FromQuery] int limit = 30)
    {
        var userId = TokenService.GetUserId(User);
        limit = Math.Clamp(limit, 1, 100);
        var messages = await db.ChatMessages
            .Where(m => m.Conversation.UserId == userId)
            .OrderByDescending(m => m.CreatedAt)
            .Take(limit)
            .Select(m => new ChatMessageDto(m.Id, m.ConversationId, m.Role, m.Text, m.CreatedAt))
            .ToListAsync();
        messages.Reverse();
        return Ok(messages);
    }

    private static string CleanTitle(string? title)
    {
        var t = (title ?? "").Trim();
        if (t.Length == 0) return "New chat";
        return t.Length > MaxTitleLength ? t[..MaxTitleLength] : t;
    }
}
