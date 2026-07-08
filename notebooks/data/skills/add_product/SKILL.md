---
name: add_product
description: Add a supplier product to the PIM as a complete, on-brand catalog entry.
---

# Skill: add_product

Use this skill when asked to reference a new supplier product in the catalog.
Goal: turn one product's free-form supplier blurb into a **complete, on-brand
catalog entry** and create it with `create_product`.

## Steps (in order)

1. **Pick the leaf category.** Call `get_category_tree`, read the tree, and
   choose the single **leaf** category that best fits the product. The supplier
   never states the category — infer it from the product description.
2. **Fetch the category's attribute schema.** Call
   `get_category_attributes(category)` to get the attributes that apply to that
   leaf. These are the keys you must fill.
3. **Find the house voice.** Call `search_products` with a description of the
   product to retrieve a few similar existing entries. Read their tone and the
   attribute values they use — these are your style and vocabulary exemplars.
4. **Write the descriptions on-brand.** Write a one-line `short_description` and
   a 2–4 sentence `long_description` that match the catalog's voice (the
   exemplars from step 3). Do not copy the supplier's marketing wording verbatim.
5. **Fill every category attribute.** For **each** key from step 2, set the
   value if the supplier blurb supports it, otherwise set it to `null`. Never
   drop a key, and never invent a value the supplier did not state.
6. **Route leftovers to `extra`.** Any supplier information that maps to no
   common field and no category attribute (warranty, MOQ, ship week, warehouse,
   supplier reference, wholesale price, …) goes into the `extra` dict.
7. **Create the product.** Call `create_product` with all common fields, the
   full `attributes` dict (step 5), and `extra` (step 6).

## Rules

- **Never invent specs.** If the supplier data is silent on an attribute, use
  `null`. Completeness means every key is present, not every key is guessed.
- **Prefer controlled vocabulary.** When a category attribute is an enum, prefer
  the values you saw in similar products (e.g. `"Yes"`/`"No"`, `"IPX7"`,
  `"Bluetooth"`) over free text.
- **Keep the catalog voice.** Descriptions must read like the existing entries,
  not like a supplier email.
- **`price` is the RETAIL price.** If the blurb gives both a wholesale and a
  suggested retail price, the catalog `price` is the **retail** one; put the
  wholesale price in `extra`.
- **Invent a SKU** if the supplier gives none (e.g. `SKU-NEW-1`).
