namespace LifeOS.Api.Dtos.Expenses;

public record CategoryBudgetDto(
    Guid Id,
    Guid UserId,
    string Category,
    decimal Amount,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record UpsertCategoryBudgetsRequest(
    Dictionary<string, decimal> Budgets
);

