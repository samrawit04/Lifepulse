namespace LifeOS.Api.Models;

/// <summary>
/// Money the user owes someone ("i_owe") or someone owes the user ("owed_to_me").
/// The remaining balance is Amount minus the sum of its payments.
/// </summary>
public class Debt
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public string Direction { get; set; } = "i_owe";
    public string Person { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string? Note { get; set; }
    public DateTime? DueDate { get; set; }
    public bool Settled { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<DebtPayment> Payments { get; set; } = [];
}

public class DebtPayment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DebtId { get; set; }
    public Debt Debt { get; set; } = null!;

    public decimal Amount { get; set; }
    public string? Note { get; set; }
    public DateTime PaidAt { get; set; } = DateTime.UtcNow;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
