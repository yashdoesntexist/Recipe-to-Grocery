public class Recipe
{
    public Guid Id { get; set; }
    public required string Title { get; set; }
    public required string SourceUrl { get; set; }

    public required List<Ingredient> Ingredients { get; set; }
}