namespace LifeOS.Api.Dtos.Chats;

public record ChatConversationDto(Guid Id, string Title, int MessageCount, DateTime CreatedAt, DateTime UpdatedAt);

public record ChatMessageDto(Guid Id, Guid ConversationId, string Role, string Text, DateTime CreatedAt);

public record CreateConversationRequest(string? Title);

public record UpdateConversationRequest(string? Title);

public record AddMessageRequest(string Role, string Text);
