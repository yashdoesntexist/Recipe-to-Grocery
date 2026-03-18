using Microsoft.AspNetCore.Mvc;
using RecipeExtensionAPI.DTOs;

[ApiController]
[Route("api")]
public class RecipesController : ControllerBase
{
[HttpPost("recipes")]
public IActionResult SaveRecipe([FromBody] RecipeDto dto)
{
    Console.WriteLine($"Recipe: {dto.Title}");

    foreach (var ing in dto.Ingredients)
    {
        Console.WriteLine($"- {ing}");
    }

    return Ok(new { message = "Recipe received!" });
}
}