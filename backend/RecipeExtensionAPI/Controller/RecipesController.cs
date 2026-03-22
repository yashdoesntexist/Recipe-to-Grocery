using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RecipeExtensionAPI.DTOs;
using System.Text.RegularExpressions;

[ApiController]
[Route("api")]
public class RecipesController : ControllerBase
{
    private readonly AppDbContext _context;

    public RecipesController(AppDbContext context)
    {
        _context = context;
    }

    [HttpPost("recipes")]
    public async Task<IActionResult> SaveRecipe([FromBody] RecipeDto dto)
    {
        try
        {
            var recipe = new Recipe
            {
                Id = Guid.NewGuid(),
                Title = dto.Title,
                SourceUrl = dto.SourceUrl,
                Ingredients = dto.Ingredients.Select(ing => new Ingredient
                {
                    Id = Guid.NewGuid(),
                    Name = NormalizeIngredient(ing),
                    RecipeId = Guid.NewGuid() // Will be set correctly after recipe save
                }).ToList()
            };

            // Set correct RecipeIds after creating the recipe
            foreach (var ingredient in recipe.Ingredients)
            {
                ingredient.RecipeId = recipe.Id;
            }

            _context.Recipes.Add(recipe);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Recipe saved successfully!", recipeId = recipe.Id });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = "Error saving recipe", error = ex.Message });
        }
    }

    [HttpGet("recipes")]
    public async Task<IActionResult> GetRecipes()
    {
        var recipes = await _context.Recipes
            .Include(r => r.Ingredients)
            .ToListAsync();

        var result = recipes.Select(r => new
        {
            r.Id,
            r.Title,
            r.SourceUrl,
            Ingredients = r.Ingredients.Select(i => new { i.Id, i.Name })
        });

        return Ok(result);
    }

    [HttpPut("recipes/{id}")]
    public async Task<IActionResult> UpdateRecipe(Guid id, [FromBody] RecipeDto dto)
    {
        var recipe = await _context.Recipes.Include(r => r.Ingredients).FirstOrDefaultAsync(r => r.Id == id);
        if (recipe == null) return NotFound(new { message = "Recipe not found" });

        recipe.Title = dto.Title;
        recipe.SourceUrl = dto.SourceUrl;

        // Replace current ingredients
        _context.Ingredients.RemoveRange(recipe.Ingredients);

        recipe.Ingredients = dto.Ingredients.Select(ing => new Ingredient
        {
            Id = Guid.NewGuid(),
            Name = ing,
            RecipeId = recipe.Id
        }).ToList();

        await _context.SaveChangesAsync();

        return Ok(new { message = "Recipe updated" });
    }

    [HttpDelete("recipes/{id}")]
    public async Task<IActionResult> DeleteRecipe(Guid id)
    {
        var recipe = await _context.Recipes.Include(r => r.Ingredients).FirstOrDefaultAsync(r => r.Id == id);
        if (recipe == null) return NotFound(new { message = "Recipe not found" });

        _context.Ingredients.RemoveRange(recipe.Ingredients);
        _context.Recipes.Remove(recipe);
        await _context.SaveChangesAsync();

        return Ok(new { message = "Recipe deleted" });
    }

    [HttpPost("match")]
    public async Task<IActionResult> MatchIngredients([FromBody] List<string> productNames)
    {
        if (productNames == null || !productNames.Any())
            return BadRequest(new { message = "No product names provided" });

        var normalizedProducts = productNames
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(NormalizeIngredient)
            .Where(p => !string.IsNullOrEmpty(p))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var recipes = await _context.Recipes
            .Include(r => r.Ingredients)
            .ToListAsync();

        var matchedRecipes = recipes.Select(r => {
            var recipeIngredients = r.Ingredients
                .Select(i => NormalizeIngredient(i.Name))
                .Where(i => !string.IsNullOrEmpty(i))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var matchingIngredients = recipeIngredients
                .Where(ri => normalizedProducts.Any(p => p.Contains(ri) || ri.Contains(p)))
                .ToList();

            return new {
                r.Id,
                r.Title,
                r.SourceUrl,
                MatchingIngredients = matchingIngredients
            };
        })
        .Where(r => r.MatchingIngredients.Any())
        .ToList();

        return Ok(matchedRecipes);
    }

    private static string NormalizeIngredient(string ingredient)
    {
        if (string.IsNullOrWhiteSpace(ingredient))
            return string.Empty;

        var value = ingredient.ToLowerInvariant().Trim();

        // Remove common quantity expressions
        value = Regex.Replace(value, @"\b\d+([\./]\d+)?\s*(g|gram|grams|kg|kilogram|kilograms|ml|l|liter|liters|cup|cups|tablespoon|tbsp|teaspoon|tsp|oz|ounce|ounces|lb|pound|pounds|pack|package|pieces|slice|slices)\b", "", RegexOptions.IgnoreCase);
        value = Regex.Replace(value, @"\b(\d+\/\d+|\d+)\b", "", RegexOptions.IgnoreCase);

        // Remove extra words
        value = Regex.Replace(value, @"\b(of|and|with|fresh|chopped|diced|minced)\b", "", RegexOptions.IgnoreCase);

        // Remove punctuation and duplicates spaces
        value = Regex.Replace(value, "[^a-z0-9 ]", " ");
        value = Regex.Replace(value, "\\s+", " ");

        return value.Trim();
    }
}