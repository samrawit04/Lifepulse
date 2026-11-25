using System.Text.Json;

namespace LifeOS.Api.Dtos.Settings;

public record SettingDto(string Key, JsonElement? Value);

public record PutSettingRequest(JsonElement Value);
