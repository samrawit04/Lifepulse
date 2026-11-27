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
[Route("api/debts")]
public class DebtsController(AppDbContext db) : ControllerBase
{
    private static readonly HashSet<string> Directions = ["i_owe", "owed_to_me"];

    [HttpGet]
    public async Task<ActionResult<List<DebtDto>>> GetAll()
    {
        var userId = TokenService.GetUserId(User);
        var debts = await db.Debts
            .Where(d => d.UserId == userId)
            .Include(d => d.Payments)
            .OrderBy(d => d.Settled)
            .ThenBy(d => d.DueDate == null)
            .ThenBy(d => d.DueDate)
            .ThenByDescending(d => d.CreatedAt)
            .AsNoTracking()
            .ToListAsync();
        return Ok(debts.Select(ToDto).ToList());
    }

    [HttpPost]
    public async Task<ActionResult<DebtDto>> Create([FromBody] CreateDebtRequest req)
    {
        var userId = TokenService.GetUserId(User);
        if (!Directions.Contains(req.Direction)) return BadRequest(new { message = "Direction must be 'i_owe' or 'owed_to_me'." });
        if (req.Amount <= 0) return BadRequest(new { message = "Amount must be greater than zero." });
        var person = (req.Person ?? "").Trim();
        if (person.Length == 0 || person.Length > 100) return BadRequest(new { message = "Name must be 1–100 characters." });

        var debt = new Debt
        {
            UserId = userId,
            Direction = req.Direction,
            Person = person,
            Amount = req.Amount,
            Note = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim(),
            DueDate = req.DueDate,
        };
        db.Debts.Add(debt);
        await db.SaveChangesAsync();
        return Ok(ToDto(debt));
    }

    [HttpPatch("{id:guid}")]
    public async Task<ActionResult<DebtDto>> Update(Guid id, [FromBody] UpdateDebtRequest req)
    {
        var userId = TokenService.GetUserId(User);
        var debt = await db.Debts.Include(d => d.Payments).FirstOrDefaultAsync(d => d.Id == id && d.UserId == userId);
        if (debt is null) return NotFound();

        if (req.Person is not null)
        {
            var person = req.Person.Trim();
            if (person.Length == 0 || person.Length > 100) return BadRequest(new { message = "Name must be 1–100 characters." });
            debt.Person = person;
        }
        if (req.Amount.HasValue)
        {
            if (req.Amount.Value <= 0) return BadRequest(new { message = "Amount must be greater than zero." });
            debt.Amount = req.Amount.Value;
        }
        if (req.Note is not null) debt.Note = req.Note.Trim().Length == 0 ? null : req.Note.Trim();
        if (req.ClearDueDate == true) debt.DueDate = null;
        else if (req.DueDate.HasValue) debt.DueDate = req.DueDate;
        if (req.Settled.HasValue) debt.Settled = req.Settled.Value;
        else debt.Settled = debt.Payments.Sum(p => p.Amount) >= debt.Amount;

        await db.SaveChangesAsync();
        return Ok(ToDto(debt));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = TokenService.GetUserId(User);
        var debt = await db.Debts.FirstOrDefaultAsync(d => d.Id == id && d.UserId == userId);
        if (debt is null) return NotFound();
        db.Debts.Remove(debt);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ── POST /api/debts/{id}/payments ── record a (partial) repayment
    [HttpPost("{id:guid}/payments")]
    public async Task<ActionResult<DebtDto>> AddPayment(Guid id, [FromBody] AddDebtPaymentRequest req)
    {
        var userId = TokenService.GetUserId(User);
        var debt = await db.Debts.Include(d => d.Payments).FirstOrDefaultAsync(d => d.Id == id && d.UserId == userId);
        if (debt is null) return NotFound();
        if (req.Amount <= 0) return BadRequest(new { message = "Amount must be greater than zero." });

        var remaining = debt.Amount - debt.Payments.Sum(p => p.Amount);
        if (req.Amount > remaining) return BadRequest(new { message = $"That's more than the remaining {remaining:0.##}." });

        var payment = new DebtPayment
        {
            DebtId = debt.Id,
            Amount = req.Amount,
            Note = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim(),
            PaidAt = req.PaidAt ?? DateTime.UtcNow,
        };
        db.DebtPayments.Add(payment);
        debt.Payments.Add(payment);
        debt.Settled = remaining - req.Amount <= 0;
        debt.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(ToDto(debt));
    }

    [HttpDelete("{id:guid}/payments/{paymentId:guid}")]
    public async Task<ActionResult<DebtDto>> DeletePayment(Guid id, Guid paymentId)
    {
        var userId = TokenService.GetUserId(User);
        var debt = await db.Debts.Include(d => d.Payments).FirstOrDefaultAsync(d => d.Id == id && d.UserId == userId);
        if (debt is null) return NotFound();
        var payment = debt.Payments.FirstOrDefault(p => p.Id == paymentId);
        if (payment is null) return NotFound();

        db.DebtPayments.Remove(payment);
        debt.Payments.Remove(payment);
        debt.Settled = debt.Payments.Sum(p => p.Amount) >= debt.Amount;
        debt.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(ToDto(debt));
    }

    private static DebtDto ToDto(Debt d)
    {
        var paid = d.Payments.Sum(p => p.Amount);
        return new DebtDto(
            d.Id, d.Direction, d.Person, d.Amount, paid, Math.Max(d.Amount - paid, 0), d.Note, d.DueDate, d.Settled,
            d.CreatedAt, d.UpdatedAt,
            d.Payments.OrderByDescending(p => p.PaidAt).Select(p => new DebtPaymentDto(p.Id, p.Amount, p.Note, p.PaidAt)).ToList()
        );
    }
}
