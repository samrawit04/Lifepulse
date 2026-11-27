using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LifeOS.Api.Migrations
{
    /// <summary>
    /// The Archive feature was removed from the app. Bring anything that was archived
    /// back into the normal views so nothing becomes invisible.
    /// </summary>
    public partial class RestoreArchivedItems : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE \"Items\" SET \"Archived\" = false WHERE \"Archived\" = true;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
