public class Ingredient
{
    public Guid Id { get; set; }
    public required string Name { get; set; }

    public Guid RecipeId { get; set; }
}