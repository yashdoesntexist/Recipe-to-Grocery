using System.ComponentModel.DataAnnotations;

namespace RecipeExtensionAPI.DTOs;

    public record RecipeDto(
        [Required] string Title,
        [Required] List<string> Ingredients,
        [Required] string SourceUrl
    );