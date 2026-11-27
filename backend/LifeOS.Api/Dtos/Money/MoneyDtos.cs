namespace LifeOS.Api.Dtos.Money;

public record IncomeDto(Guid Id, decimal Amount, string Source, string? Note, DateTime ReceivedAt, DateTime CreatedAt, DateTime UpdatedAt);
public record CreateIncomeRequest(decimal Amount, string Source, string? Note, DateTime? ReceivedAt);
public record UpdateIncomeRequest(decimal? Amount, string? Source, string? Note, DateTime? ReceivedAt);

public record DebtPaymentDto(Guid Id, decimal Amount, string? Note, DateTime PaidAt);
public record DebtDto(
    Guid Id,
    string Direction,
    string Person,
    decimal Amount,
    decimal Paid,
    decimal Remaining,
    string? Note,
    DateTime? DueDate,
    bool Settled,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    List<DebtPaymentDto> Payments
);
public record CreateDebtRequest(string Direction, string Person, decimal Amount, string? Note, DateTime? DueDate);
public record UpdateDebtRequest(string? Person, decimal? Amount, string? Note, DateTime? DueDate, bool? ClearDueDate, bool? Settled);
public record AddDebtPaymentRequest(decimal Amount, string? Note, DateTime? PaidAt);
