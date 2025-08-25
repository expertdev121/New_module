// "use client";

// import { db } from '@/lib/db';
// import { categoryItem, category } from '@/lib/db//schema';
// import { STATIC_CATEGORIES } from '@/lib/data/categories'; 

// async function seedCategoryItems() {
//   try {
//     console.log('Starting to seed category items...');
    
//     // First, ensure categories exist in the database
//     const existingCategories = await db.select().from(category);
//     const categoryMap = new Map(existingCategories.map(cat => [cat.name, cat.id]));
    
//     // Prepare items for insertion
//     const itemsToInsert: Array<{ name: string; categoryId: number }> = [];
    
//     for (const staticCategory of STATIC_CATEGORIES) {
//       const dbCategoryId = categoryMap.get(staticCategory.name);
      
//       if (dbCategoryId) {
//         staticCategory.items.forEach(itemName => {
//           itemsToInsert.push({
//             name: itemName,
//             categoryId: dbCategoryId
//           });
//         });
//       } else {
//         console.warn(`Category "${staticCategory.name}" not found in database`);
//       }
//     }
    
//     // Insert items in batches
//     const batchSize = 100;
//     for (let i = 0; i < itemsToInsert.length; i += batchSize) {
//       const batch = itemsToInsert.slice(i, i + batchSize);
//       await db.insert(categoryItem).values(batch);
//       console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(itemsToInsert.length / batchSize)}`);
//     }
    
//     console.log(`Successfully seeded ${itemsToInsert.length} category items`);
//     process.exit(0);
//   } catch (error) {
//     console.error('Error seeding category items:', error);
//     process.exit(1);
//   }
// }

// // Run the seed function
// seedCategoryItems();
