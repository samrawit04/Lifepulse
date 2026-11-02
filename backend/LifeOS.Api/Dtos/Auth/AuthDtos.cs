namespace LifeOS.Api.Dtos.Auth;

public record RegisterRequest(string Email, string Password);
public record LoginRequest(string Email, string Password);
public record GoogleCallbackRequest(string Code, string? RedirectUri);

public record AuthResponse(string Token, UserDto User);
public record UserDto(Guid Id, string Email);

// Extended profile DTO returned by GET /api/auth/me
public record UserProfileDto(
    Guid Id,
    string Email,
    string? DisplayName,
    string? AvatarUrl,
    string? StatusMessage,
    string? Theme,
    string[]? HiddenSidebarItems
);

// Request body for PATCH /api/auth/profile
public record UpdateProfileRequest(
    string? DisplayName,
    string? AvatarUrl,
    string? StatusMessage,
    string? Theme,
    string[]? HiddenSidebarItems
);
