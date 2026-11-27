using LifeOS.Api.Data;
using LifeOS.Api.Dtos.Money;
using LifeOS.Api.Models;
using LifeOS.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/incomes")]
public class IncomesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<IncomeDto>>> GetAll()
    {
        var userId = TokenService.GetUserId(User);
        var list = await db.Incomes
            .Where(i => i.UserId == userId)
            .OrderByDescending(i => i.ReceivedAt)
            .Select(i => ToDto(i))
            .ToListAsync();
        return Ok(list);
    }

    [HttpPost]
    public async Task<ActionResult<IncomeDto>> Create([FromBody] CreateIncomeRequest req)
    {
        var userId = TokenService.GetUserId(User);
        if (req.Amount <= 0) return BadRequest(new { message = "Amount must be greater than zero." });
        var source = (req.Source ?? "").Trim();
        if (source.Length == 0 || source.Length > 100) return BadRequest(new { message = "Source must be 1–100 characters." });

        var income = new Income
        {
            UserId = userId,
            Amount = req.Amount,
            Source = source,
            Note = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim(),
            ReceivedAt = req.ReceivedAt ?? DateTime.UtcNow,
        };
        db.Incomes.Add(income);
        await db.SaveChangesAsync();
        return Ok(ToDto(income));
    }

    [HttpPatch("{id:guid}")]
    public async Task<ActionResult<IncomeDto>> Update(Guid id, [FromBody] UpdateIncomeRequest req)
    {
        var userId = TokenService.GetUserId(User);
        var income = await db.Incomes.FirstOrDefaultAsync(i => i.Id == id && i.UserId == userId);
        if (income is null) return NotFound();

        if (req.Amount.HasValue)
        {
            if (req.Amount.Value <= 0) return BadRequest(new { message = "Amount must be greater than zero." });
            income.Amount = req.Amount.Value;
        }
        if (req.Source is not null)
        {
            var source = req.Source.Trim();
            if (source.Length == 0 || source.Length > 100) return BadRequest(new { message = "Source must be 1–100 characters." });
            income.Source = source;
        }
        if (req.Note is not null) income.Note = req.Note.Trim().Length == 0 ? null : req.Note.Trim();
        if (req.ReceivedAt.HasValue) income.ReceivedAt = req.ReceivedAt.Value;

        await db.SaveChangesAsync();
        return Ok(ToDto(income));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = TokenService.GetUserId(User);
        var income = await db.Incomes.FirstOrDefaultAsync(i => i.Id == id && i.UserId == userId);
        if (income is null) return NotFound();
        db.Incomes.Remove(income);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static IncomeDto ToDto(Income i) => new(i.Id, i.Amount, i.Source, i.Note, i.ReceivedAt, i.CreatedAt, i.UpdatedAt);
}
