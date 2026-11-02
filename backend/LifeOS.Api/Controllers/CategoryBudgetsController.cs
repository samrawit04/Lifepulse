using LifeOS.Api.Data;
using LifeOS.Api.Dtos.Expenses;
using LifeOS.Api.Models;
using LifeOS.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/category-budgets")]
public class CategoryBudgetsController(AppDbContext db) : ControllerBase
{
    // ── GET /api/category-budgets ─────────────────────────────────────────────
    [HttpGet]
    public async Task<ActionResult<Dictionary<string, decimal>>> GetAll()
    {
        var userId = TokenService.GetUserId(User);
        var budgets = await db.CategoryBudgets
            .Where(b => b.UserId == userId)
            .ToDictionaryAsync(b => b.Category, b => b.Amount);

        return Ok(budgets);
    }

    // ── PUT /api/category-budgets ─────────────────────────────────────────────
    [HttpPut]
    public async Task<ActionResult<Dictionary<string, decimal>>> Upsert([FromBody] UpsertCategoryBudgetsRequest req)
    {
        var userId = TokenService.GetUserId(User);
        var existingBudgets = await db.CategoryBudgets
            .Where(b => b.UserId == userId)
            .ToListAsync();

        var existingMap = existingBudgets.ToDictionary(b => b.Category);
        var incomingCategories = req.Budgets?.Keys.ToHashSet() ?? [];

        // Update or insert
        if (req.Budgets is not null)
        {
            foreach (var (cat, amt) in req.Budgets)
            {
                if (existingMap.TryGetValue(cat, out var existing))
                {
                    existing.Amount = amt;
                }
                else
                {
                    db.CategoryBudgets.Add(new CategoryBudget
                    {
                        UserId = userId,
                        Category = cat,
                        Amount = amt
                    });
                }
            }
        }

        // Remove any budgets not present in the new set
        foreach (var existing in existingBudgets)
        {
            if (!incomingCategories.Contains(existing.Category))
            {
                db.CategoryBudgets.Remove(existing);
            }
        }

        await db.SaveChangesAsync();

        var result = await db.CategoryBudgets
            .Where(b => b.UserId == userId)
            .ToDictionaryAsync(b => b.Category, b => b.Amount);

        return Ok(result);
    }
}

