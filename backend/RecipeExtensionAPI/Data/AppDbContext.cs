using Microsoft.EntityFrameworkCore;
using RecipeExtensionAPI.DTOs;


public class AppDbContext : DbContext
{
    public DbSet<Recipe> Recipes { get; set; }
    public DbSet<Ingredient> Ingredients { get; set; }

    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options) { }
}