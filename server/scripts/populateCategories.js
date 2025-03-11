const mongoose = require('mongoose');
require('dotenv').config();

// Categories data in Hebrew
const categories = [
  {
    name: 'חשמלאים',
    description: 'תיקון והתקנת מערכות חשמל',
    icon: 'electrical_services',
    subcategories: [
      'תיקוני חשמל',
      'התקנת מערכות חשמל',
      'בדיקות חשמל',
      'תאורה',
      'מערכות מיזוג'
    ]
  },
  {
    name: 'אינסטלטורים',
    description: 'שירותי אינסטלציה וצנרת',
    icon: 'plumbing',
    subcategories: [
      'תיקוני צנרת',
      'התקנת מערכות מים',
      'ביוב וניקוז',
      'דודי שמש',
      'ברזים וכיורים'
    ]
  },
  {
    name: 'מעצבי פנים',
    description: 'עיצוב ותכנון פנים הבית',
    icon: 'design_services',
    subcategories: [
      'עיצוב דירות',
      'תכנון מטבחים',
      'עיצוב חדרי אמבטיה',
      'בחירת צבעים וחומרים',
      'תכנון תאורה'
    ]
  },
  {
    name: 'שיפוצניקים',
    description: 'שיפוצים כלליים ועבודות בניה',
    icon: 'construction',
    subcategories: [
      'שיפוץ כללי',
      'צביעה',
      'ריצוף',
      'גבס',
      'איטום'
    ]
  },
  {
    name: 'גננים',
    description: 'עיצוב ותחזוקת גינות',
    icon: 'yard',
    subcategories: [
      'תכנון גינות',
      'גיזום וטיפול בצמחים',
      'מערכות השקיה',
      'דשא סינטטי',
      'גינות גג'
    ]
  },
  {
    name: 'מנקים',
    description: 'שירותי ניקיון מקצועיים',
    icon: 'cleaning_services',
    subcategories: [
      'ניקיון דירות',
      'ניקיון משרדים',
      'ניקיון חלונות',
      'ניקיון ספות',
      'ניקיון שטיחים'
    ]
  },
  {
    name: 'טכנאי מחשבים',
    description: 'תיקון ותחזוקת מחשבים',
    icon: 'computer',
    subcategories: [
      'תיקון מחשבים',
      'התקנת תוכנות',
      'שדרוג חומרה',
      'גיבוי מידע',
      'הסרת וירוסים'
    ]
  },
  {
    name: 'מורים פרטיים',
    description: 'שיעורים פרטיים במגוון תחומים',
    icon: 'school',
    subcategories: [
      'מתמטיקה',
      'אנגלית',
      'פיזיקה',
      'כימיה',
      'לשון'
    ]
  },
  {
    name: 'מאמני כושר',
    description: 'אימוני כושר אישיים',
    icon: 'fitness_center',
    subcategories: [
      'אימון אישי',
      'תזונה נכונה',
      'פילאטיס',
      'יוגה',
      'אירובי'
    ]
  },
  {
    name: 'צלמים',
    description: 'שירותי צילום מקצועיים',
    icon: 'camera_alt',
    subcategories: [
      'צילומי אירועים',
      'צילומי תדמית',
      'צילומי מוצר',
      'צילומי משפחה',
      'עריכת וידאו'
    ]
  }
];

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Category model
const Category = require('../Models/category');

// Function to populate categories
async function populateCategories() {
  try {
    // Clear existing categories
    await Category.deleteMany({});
    console.log('Cleared existing categories');

    // Add categories with Hebrew data
    const categoriesWithMetadata = categories.map(category => ({
      ...category,
      slug: category.name.toLowerCase().replace(/\s+/g, '-'),
      isActive: true,
      searchTerms: [
        category.name,
        ...category.subcategories,
        category.description
      ].join(' '),
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    await Category.insertMany(categoriesWithMetadata);
    console.log(`Successfully populated ${categories.length} categories`);

    // Create text index for search
    await Category.collection.createIndex(
      { name: 'text', description: 'text', searchTerms: 'text' },
      { weights: { name: 10, description: 5, searchTerms: 1 }, default_language: 'none' }
    );
    console.log('Created text indexes for categories');

    mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error populating categories:', error);
    mongoose.disconnect();
    process.exit(1);
  }
}

// Run the population script
populateCategories();
