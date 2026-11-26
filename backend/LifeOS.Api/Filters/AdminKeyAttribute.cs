using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace LifeOS.Api.Filters;

/// <summary>
/// Protects admin/maintenance endpoints with a shared secret.
///
/// Callers must send the header <c>X-Admin-Key</c> matching the configured
/// <c>Admin:ApiKey</c> (env var <c>Admin__ApiKey</c>). If no key is configured
/// (or it is shorter than 32 characters) the endpoints are disabled entirely,
/// so a missing setting can never leave them open.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class AdminKeyAttribute : Attribute, IAuthorizationFilter
{
    public const string HeaderName = "X-Admin-Key";
    private const int MinKeyLength = 32;

    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var services = context.HttpContext.RequestServices;
        var config = services.GetRequiredService<IConfiguration>();
        var logger = services.GetRequiredService<ILogger<AdminKeyAttribute>>();
        var expected = config["Admin:ApiKey"];

        if (string.IsNullOrWhiteSpace(expected) || expected.Length < MinKeyLength)
        {
            context.Result = new ObjectResult(new
            {
                message = $"Admin endpoints are disabled. Configure Admin:ApiKey (at least {MinKeyLength} characters) to enable them."
            })
            { StatusCode = StatusCodes.Status503ServiceUnavailable };
            return;
        }

        var provided = context.HttpContext.Request.Headers[HeaderName].ToString();
        if (string.IsNullOrEmpty(provided) || !FixedTimeEquals(provided, expected))
        {
            logger.LogWarning(
                "Rejected admin request to {Path} from {Ip}",
                context.HttpContext.Request.Path,
                context.HttpContext.Connection.RemoteIpAddress);
            context.Result = new UnauthorizedObjectResult(new { message = "Missing or invalid admin key." });
        }
    }

    private static bool FixedTimeEquals(string a, string b)
    {
        var ab = SHA256.HashData(Encoding.UTF8.GetBytes(a));
        var bb = SHA256.HashData(Encoding.UTF8.GetBytes(b));
        return CryptographicOperations.FixedTimeEquals(ab, bb);
    }
}
